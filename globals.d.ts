declare interface Window {
  Telegram: {
    WebApp: any;
  };
}

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    FOLDER_ID: string;
    PORT?: string;
  }
}
