import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const catalogs = {
  zh: () => import("./locales/zh.json"),
  en: () => import("./locales/en.json"),
} as const;

type CatalogLanguage = keyof typeof catalogs;

const loaded = new Set<CatalogLanguage>();

function catalogLanguage(lng: string | undefined): CatalogLanguage {
  return lng?.toLowerCase().startsWith("en") ? "en" : "zh";
}

function detectInitialLanguage(): CatalogLanguage {
  try {
    const stored = globalThis.localStorage?.getItem("i18nextLng");
    if (stored) {
      return catalogLanguage(stored);
    }
  } catch {
    // Storage can throw in private browsing; fall through to the navigator.
  }

  return catalogLanguage(globalThis.navigator?.language);
}

async function ensureCatalog(lng: string | undefined): Promise<CatalogLanguage> {
  const language = catalogLanguage(lng);
  if (loaded.has(language)) {
    return language;
  }

  const catalog = await catalogs[language]();
  i18n.addResourceBundle(language, "translation", catalog.default, true, true);
  loaded.add(language);
  return language;
}

function syncDocumentLang(lng?: string) {
  if (typeof document !== "undefined" && lng) {
    document.documentElement.lang = lng;
  }
}

const initialLanguage = detectInitialLanguage();
const initialCatalog = await catalogs[initialLanguage]();
loaded.add(initialLanguage);

await i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    resources: {
      [initialLanguage]: { translation: initialCatalog.default },
    },
    fallbackLng: "zh",
    supportedLngs: ["zh", "en"],
    load: "languageOnly",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false, // React already handles XSS escaping
    },
  });

const resolvedLanguage = catalogLanguage(i18n.resolvedLanguage ?? i18n.language);
if (resolvedLanguage !== initialLanguage) {
  await ensureCatalog(resolvedLanguage);
  await i18n.changeLanguage(resolvedLanguage);
}

// Tests call getFixedT("zh" | "en") synchronously. Production startup loads
// only the active catalog; the other catalog stays a separate chunk.
if (import.meta.env.MODE === "test") {
  await ensureCatalog("zh");
  await ensureCatalog("en");
}

const changeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (lng, callback) => {
  if (typeof lng === "string") {
    await ensureCatalog(lng);
  }
  return changeLanguage(lng, callback);
};

i18n.on("languageChanged", syncDocumentLang);
syncDocumentLang(i18n.resolvedLanguage ?? i18n.language);

export default i18n;
