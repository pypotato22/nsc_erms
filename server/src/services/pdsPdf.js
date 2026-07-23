import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HttpError } from '../middleware/errors.js';

/** @type {Promise<void>} */
let queue = Promise.resolve();

/**
 * Serialize conversions (Excel COM especially cannot run concurrent instances safely).
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function whichExists(candidates) {
  for (const c of candidates) {
    if (c && fsSync.existsSync(c)) return c;
  }
  return null;
}

export function findSofficePath() {
  if (process.env.SOFFICE_PATH && fsSync.existsSync(process.env.SOFFICE_PATH)) {
    return process.env.SOFFICE_PATH;
  }
  if (process.env.LIBREOFFICE_PATH && fsSync.existsSync(process.env.LIBREOFFICE_PATH)) {
    return process.env.LIBREOFFICE_PATH;
  }
  const winCandidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  // Glob-ish common versioned folders
  for (const base of ['C:\\Program Files', 'C:\\Program Files (x86)']) {
    try {
      const dirs = fsSync.readdirSync(base).filter((d) => /^LibreOffice/i.test(d));
      for (const d of dirs) {
        winCandidates.push(path.join(base, d, 'program', 'soffice.exe'));
      }
    } catch {
      /* ignore */
    }
  }
  if (process.platform !== 'win32') {
    return whichExists(['/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice', '/snap/bin/libreoffice']);
  }
  return whichExists(winCandidates);
}

/**
 * Convert an XLSX buffer to PDF using LibreOffice, or Excel COM on Windows.
 * @param {Buffer} xlsxBuffer
 * @returns {Promise<{ pdf: Buffer, engine: 'libreoffice'|'excel-com' }>}
 */
export async function convertXlsxBufferToPdf(xlsxBuffer) {
  return enqueue(async () => {
    const soffice = findSofficePath();
    if (soffice) {
      const pdf = await convertWithLibreOffice(soffice, xlsxBuffer);
      return { pdf, engine: 'libreoffice' };
    }
    if (process.platform === 'win32') {
      try {
        const pdf = await convertWithExcelCom(xlsxBuffer);
        return { pdf, engine: 'excel-com' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/ActiveX|COM|Excel\.Application|0x800/i.test(msg)) {
          throw missingToolError();
        }
        throw err;
      }
    }
    throw missingToolError();
  });
}

function missingToolError() {
  return new HttpError(
    503,
    'PDF conversion needs LibreOffice (soffice) or Microsoft Excel on the server. Install LibreOffice and restart the API, or set SOFFICE_PATH. You can still download the official Excel file.',
    'MISSING_TOOL',
  );
}

async function convertWithLibreOffice(sofficePath, xlsxBuffer) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nsc-pds-'));
  const xlsxPath = path.join(tmpRoot, 'pds.xlsx');
  const pdfPath = path.join(tmpRoot, 'pds.pdf');
  try {
    await fs.writeFile(xlsxPath, xlsxBuffer);
    await runCommand(
      sofficePath,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        tmpRoot,
        xlsxPath,
      ],
      { timeoutMs: 120_000 },
    );
    if (!fsSync.existsSync(pdfPath)) {
      // LibreOffice sometimes names from input stem
      const files = await fs.readdir(tmpRoot);
      const found = files.find((f) => f.toLowerCase().endsWith('.pdf'));
      if (!found) {
        throw new HttpError(500, 'LibreOffice did not produce a PDF file', 'COMMAND_FAILED');
      }
      return await fs.readFile(path.join(tmpRoot, found));
    }
    return await fs.readFile(pdfPath);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function convertWithExcelCom(xlsxBuffer) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nsc-pds-'));
  const xlsxPath = path.join(tmpRoot, 'pds.xlsx');
  const pdfPath = path.join(tmpRoot, 'pds.pdf');
  const scriptPath = path.join(tmpRoot, 'export.ps1');
  const ps = `
$ErrorActionPreference = 'Stop'
$inputPath = '${xlsxPath.replace(/'/g, "''")}'
$outputPath = '${pdfPath.replace(/'/g, "''")}'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
try {
  $wb = $excel.Workbooks.Open($inputPath)
  # 0 = xlTypePDF
  $wb.ExportAsFixedFormat(0, $outputPath)
  $wb.Close($false)
} finally {
  $excel.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;
  try {
    await fs.writeFile(xlsxPath, xlsxBuffer);
    await fs.writeFile(scriptPath, ps, 'utf8');
    await runCommand(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeoutMs: 120_000 },
    );
    if (!fsSync.existsSync(pdfPath)) {
      throw new HttpError(500, 'Excel COM did not produce a PDF file', 'COMMAND_FAILED');
    }
    return await fs.readFile(pdfPath);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [opts]
 */
function runCommand(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new HttpError(500, `PDF conversion timed out after ${timeoutMs}ms`, 'COMMAND_FAILED'));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new HttpError(
            500,
            `PDF conversion failed (exit ${code}): ${(stderr || stdout).slice(0, 400)}`,
            'COMMAND_FAILED',
          ),
        );
      }
    });
  });
}

export function pdsPdfFilename(employee) {
  const surname = String(employee?.lastName || employee?.pds?.personal?.surname || 'Employee')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  const first = String(employee?.firstName || employee?.pds?.personal?.firstName || '')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 20);
  return `PDS_${surname}_${first || 'X'}_CS212.pdf`;
}
