import { en } from "./en";

// Keep language registration data-driven so adding the next ten languages only
// requires a dictionary and a metadata entry; game scenes do not need changes.
export type LanguageCode = string;

export interface TranslationDictionary {
  [key: string]: string;
}

const dictionaries: Record<string, TranslationDictionary> = {
  en,
};

const languageNames: Record<string, string> = {
  en: "ENGLISH",
};

class Localization {
  private currentLanguage: LanguageCode = "en";

  constructor() {
    this.loadLanguage();
  }

  public setLanguage(lang: LanguageCode) {
    if (!dictionaries[lang]) return;
    this.currentLanguage = lang;
    localStorage.setItem("castle-raid-lang", lang);
  }

  public getLanguage(): LanguageCode {
    return this.currentLanguage;
  }

  public toggleLanguage() {
    const langs = this.getAvailableLanguages();
    const currentIndex = langs.indexOf(this.currentLanguage);
    const nextIndex = (currentIndex + 1) % langs.length;
    this.setLanguage(langs[nextIndex]);
  }

  public getLanguageName(lang: LanguageCode): string {
    return languageNames[lang] || lang.toUpperCase();
  }

  public getAvailableLanguages(): LanguageCode[] {
    return Object.keys(dictionaries);
  }

  /** Register a future translation without touching scene code. */
  public registerLanguage(code: LanguageCode, name: string, dictionary: TranslationDictionary) {
    dictionaries[code] = dictionary;
    languageNames[code] = name;
  }

  private loadLanguage() {
    const saved = localStorage.getItem("castle-raid-lang");
    if (saved && saved in dictionaries) {
      this.currentLanguage = saved as LanguageCode;
    }
  }

  public t(key: keyof typeof en, params?: Record<string, string | number>): string {
    const dictionary = dictionaries[this.currentLanguage] || dictionaries.en;
    let text = dictionary[key] || dictionaries.en[key] || key;

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`{${paramKey}}`, "g"), String(paramValue));
      }
    }

    return text;
  }
}

export const i18n = new Localization();
export const t = i18n.t.bind(i18n);
