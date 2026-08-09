import { en } from "./en";

export type LanguageCode = "en";

export interface TranslationDictionary {
  [key: string]: string;
}

const dictionaries: Record<LanguageCode, TranslationDictionary> = {
  en,
};

class Localization {
  private currentLanguage: LanguageCode = "en";

  constructor() {
    this.loadLanguage();
  }

  public setLanguage(lang: LanguageCode) {
    this.currentLanguage = lang;
    localStorage.setItem("castle-raid-lang", lang);
  }

  public getLanguage(): LanguageCode {
    return this.currentLanguage;
  }

  public toggleLanguage() {
    // For now, only English is fully supported.
    // To support more languages, toggle between them here.
    const langs: LanguageCode[] = ["en"];
    const currentIndex = langs.indexOf(this.currentLanguage);
    const nextIndex = (currentIndex + 1) % langs.length;
    this.setLanguage(langs[nextIndex]);
  }

  public getLanguageName(lang: LanguageCode): string {
    const names: Record<LanguageCode, string> = {
      en: "ENGLISH",
    };
    return names[lang];
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
