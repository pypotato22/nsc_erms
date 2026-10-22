import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetForegroundWindow = user32.func('void *GetForegroundWindow()');
const GetWindowThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
const AttachThreadInput = user32.func('int AttachThreadInput(uint32 from, uint32 to, int attach)');
const GetCurrentThreadId = kernel32.func('uint32 GetCurrentThreadId()');
const CreateWindowExW = user32.func(
  'void *CreateWindowExW(uint32 exStyle, str16 className, str16 title, uint32 style, int x, int y, int width, int height, void *parent, void *menu, void *instance, void *param)',
);
const ShowWindow = user32.func('int ShowWindow(void *hwnd, int cmd)');
const SetForegroundWindow = user32.func('int SetForegroundWindow(void *hwnd)');
const DestroyWindow = user32.func('int DestroyWindow(void *hwnd)');
const PeekMessageW = user32.func('int PeekMessageW(void *msg, void *hwnd, uint32 min, uint32 max, uint32 remove)');
const SetWindowPos = user32.func(
  'int SetWindowPos(void *hwnd, void *after, int x, int y, int width, int height, uint32 flags)',
);
const GetSystemMetrics = user32.func('int GetSystemMetrics(int index)');
const SetLayeredWindowAttributes = user32.func(
  'int SetLayeredWindowAttributes(void *hwnd, uint32 crKey, uint8 alpha, uint32 flags)',
);

// Windows only lets the reader capture while this process owns the foreground
// window, so a small helper window is still created. By default it is invisible and
// click-through (nobody sees or touches it); the app window and its capture dialog
// are the only things on screen. Set FINGERPRINT_SHOW_PROMPT=1 to bring back the
// old visible "Place your right thumb" window if capture ever misbehaves.
const SHOW_PROMPT = /^(1|true|yes)$/i.test(process.env.FINGERPRINT_SHOW_PROMPT || '');
const WS_EX_TOPMOST = 0x00000008;
const WS_EX_TRANSPARENT = 0x00000020; // clicks pass through to the window below
const WS_EX_TOOLWINDOW = 0x00000080; // no taskbar button / Alt-Tab entry
const WS_EX_LAYERED = 0x00080000;
const LWA_ALPHA = 0x00000002;

const HWND_TOPMOST = 0xFFFFFFFFFFFFFFFFn;
const SWP_SHOWWINDOW = 0x0040;

export function acquireReaderFocus() {
  const queue = Buffer.alloc(256);
  PeekMessageW(queue, null, 0, 0, 0);

  const width = 460;
  const height = 150;
  const screenW = GetSystemMetrics(0) || 1280;
  const screenH = GetSystemMetrics(1) || 800;
  const x = Math.max(0, Math.floor((screenW - width) / 2));
  const y = Math.max(0, Math.floor((screenH - height) / 3));
  const style = SHOW_PROMPT
    ? (0x80000000 | 0x10000000 | 0x00c00000 | 0x00080000) >>> 0
    : (0x80000000 | 0x10000000) >>> 0; // POPUP | VISIBLE, no caption or border
  const exStyle = SHOW_PROMPT
    ? WS_EX_TOPMOST
    : (WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW) >>> 0;
  const hwnd = CreateWindowExW(
    exStyle,
    'Static',
    'Place your right thumb on the U.are.U 4500',
    style,
    x,
    y,
    width,
    height,
    null,
    null,
    null,
    null,
  );

  // Practically invisible (1/255 opacity) but still a real, active window.
  if (!SHOW_PROMPT && hwnd) SetLayeredWindowAttributes(hwnd, 0, 1, LWA_ALPHA);

  const foreground = GetForegroundWindow();
  const pid = [0];
  const foregroundThread = foreground ? GetWindowThreadProcessId(foreground, pid) : 0;
  const threadId = GetCurrentThreadId();
  let attachedTo = 0;
  if (foregroundThread && foregroundThread !== threadId) {
    if (AttachThreadInput(threadId, foregroundThread, 1)) attachedTo = foregroundThread;
  }

  const nudge = () => {
    if (!hwnd) return;
    SetForegroundWindow(hwnd);
    SetWindowPos(hwnd, HWND_TOPMOST, x, y, width, height, SWP_SHOWWINDOW);
    ShowWindow(hwnd, 5);
  };
  nudge();

  return {
    hwnd,
    nudge,
    release() {
      if (attachedTo) {
        try { AttachThreadInput(threadId, attachedTo, 0); } catch { /* already detached */ }
      }
      if (hwnd) {
        try { DestroyWindow(hwnd); } catch { /* already destroyed */ }
      }
    },
  };
}
