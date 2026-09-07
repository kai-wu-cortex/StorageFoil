export function convertWpsDateValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const value = String(raw).trim();
  if (!value) return '';

  if (/^\d+(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 0 && serial < 80_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }
    return '';
  }

  const chineseDate = value.match(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})[时:](\d{1,2})(?:[分:](\d{1,2}))?)?/,
  );
  if (chineseDate) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = chineseDate;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
