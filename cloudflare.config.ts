import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "jianpu-solfege-trainer",
    "compatibilityDate": "2026-09-30",
    "observability": {
      "enabled": true
    },
    "assets": {
      "notFoundHandling": "single-page-application"
    }
  }
});
