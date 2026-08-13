export function normalizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.displayName || user.username,
    role: user.role?.name || user.role?.code || '',
    roleCode: user.role?.code || '',
    employeeId: user.employeeId ?? null,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}
