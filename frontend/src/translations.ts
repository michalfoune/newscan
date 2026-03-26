export type Language = 'en' | 'cs';

export interface Translations {
  tagline: string;
  requestLabel: string;
  requestPlaceholder: string;
  prefsToggleShow: string;
  prefsToggleHide: string;
  prefsLabel: string;
  prefsPlaceholder: string;
  submit: string;
  generating: string;
  stories: (n: number) => string;
  generatedAt: (t: string) => string;
  toneLabels: { positive: string; neutral: string; concerning: string };
  timeJustNow: string;
  timeHoursAgo: (h: number) => string;
  timeYesterday: (time: string) => string;
}

export const translations: Record<Language, Translations> = {
  en: {
    tagline: 'Stay informed without emotional overload.',
    requestLabel: 'What would you like to know?',
    requestPlaceholder:
      'e.g. Give me one update on the Russia-Ukraine situation, then some good news from science or wildlife.',
    prefsToggleShow: '+ Persistent preferences',
    prefsToggleHide: '− Hide preferences',
    prefsLabel: 'General rules for every briefing',
    prefsPlaceholder:
      'e.g. Never include more than 1 concerning story. Keep tone calm and factual. No detailed war coverage.',
    submit: 'Run',
    generating: 'Generating…',
    stories: (n) => `${n} ${n === 1 ? 'story' : 'stories'}`,
    generatedAt: (t) => `Generated at ${t}`,
    toneLabels: { positive: 'Positive', neutral: 'Neutral', concerning: 'Concerning' },
    timeJustNow: 'Just now',
    timeHoursAgo: (h) => `${h}h ago`,
    timeYesterday: (time) => `Yesterday, ${time}`,
  },
  cs: {
    tagline: 'Zůstaňte informováni bez emočního přetížení.',
    requestLabel: 'Co byste chtěli vědět?',
    requestPlaceholder:
      'Např. Dej mi jednu aktualizaci o situaci na Ukrajině a pak dobré zprávy z vědy nebo přírody.',
    prefsToggleShow: '+ Trvalé předvolby',
    prefsToggleHide: '− Skrýt předvolby',
    prefsLabel: 'Obecná pravidla pro každý přehled',
    prefsPlaceholder:
      'Např. Nezahrnuj více než 1 znepokojivý příběh. Udržuj klidný a věcný tón. Žádné detailní zpravodajství o válkách.',
    submit: 'Spustit',
    generating: 'Generuji…',
    stories: (n) => `${n} ${n === 1 ? 'příběh' : n < 5 ? 'příběhy' : 'příběhů'}`,
    generatedAt: (t) => `Vygenerováno v ${t}`,
    toneLabels: { positive: 'Pozitivní', neutral: 'Neutrální', concerning: 'Znepokojivé' },
    timeJustNow: 'Právě teď',
    timeHoursAgo: (h) => `před ${h}h`,
    timeYesterday: (time) => `Včera v ${time}`,
  },
};
