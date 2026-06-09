/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BRAND_PAGE_TITLE: string;
  readonly BRAND_FOOTER_TEXT: string;
  readonly BRAND_WORDMARK: string;
  readonly BRAND_WORDMARK_ACCENT_LEN: number;
  readonly BRAND_MARK_URL: string;
  readonly VITE_MOCK_API?: string;
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
