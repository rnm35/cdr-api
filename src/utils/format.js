// db rows -> api json

export function toCall(row) {
  return {
    id: row.id,
    callerName: row.caller_name,
    callerNumber: row.caller_number,
    receiverNumber: row.receiver_number,
    city: row.city,
    direction: row.direction,
    status: row.status,
    durationSeconds: row.duration_seconds,
    cost: Number(row.cost),
    startTime: new Date(row.start_time).toISOString(),
    endTime: new Date(row.end_time).toISOString(),
  };
}

export function toUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// 07387416172 -> 073*****172
export function maskNumber(number) {
  if (number.length <= 6) return "*".repeat(number.length);
  return `${number.slice(0, 3)}${"*".repeat(number.length - 6)}${number.slice(-3)}`;
}

export const round2 = (value) => Math.round(Number(value) * 100) / 100;
