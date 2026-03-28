/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_FACEBOOK_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  handler?: (response: unknown) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayInstance {
  open(): void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

interface Window {
  Razorpay?: RazorpayConstructor;
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            error?: string;
            error_description?: string;
          }) => void;
        }): {
          requestAccessToken(options?: {
            prompt?: string;
          }): void;
        };
      };
    };
  };
  fbAsyncInit?: () => void;
  FB?: {
    init(config: {
      appId: string;
      cookie: boolean;
      xfbml: boolean;
      version: string;
    }): void;
    login(
      callback: (response: {
        authResponse?: {
          accessToken?: string;
        };
      }) => void,
      options?: {
        scope?: string;
      }
    ): void;
  };
}
