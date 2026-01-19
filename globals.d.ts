// Минимальные типы для окружения Vite, где мы используем define("process.env.*")
// Это не добавляет Node-полифилы в рантайм — только убирает TS-ошибки.
declare const process: {
  env: Record<string, string | undefined>;
};

