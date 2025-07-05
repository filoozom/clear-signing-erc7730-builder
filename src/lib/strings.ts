export const lowerCaseFirst = (string?: string): string => {
  if (!string?.[0]) {
    return "";
  }
  return string.charAt(0).toLowerCase() + string.slice(1);
};
