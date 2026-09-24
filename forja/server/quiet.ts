// node:sqlite todavía emite un ExperimentalWarning. Lo silenciamos solo a él.
const original = process.emitWarning.bind(process);
(process as any).emitWarning = (warning: any, ...args: any[]) => {
  const text = typeof warning === "string" ? warning : warning?.message ?? "";
  const type = typeof args[0] === "string" ? args[0] : args[0]?.type;
  if ((type === "ExperimentalWarning" || warning?.name === "ExperimentalWarning") && /SQLite/i.test(text)) return;
  return original(warning, ...args);
};
export {};
