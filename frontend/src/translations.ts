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
  modeLabels: { calm: string; balanced: string; brave: string };
  modeTooltip: string;
  categories: string[];
  timeJustNow: string;
  timeHoursAgo: (h: number) => string;
  timeYesterday: (time: string) => string;
  whyItMatters: string;
  fromTheSource: string;
  readOriginal: string;
  noResults: string;
  noResultsForTopics: (topics: string[]) => string;
  overallSummaryLabel: string;
  chatPlaceholder: string;
  chatSend: string;
  chatSending: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    tagline: 'Stay informed without emotional overload.',
    requestLabel: 'What would you like to know?',
    requestPlaceholder: 'e.g. What\'s the most important news today?',
    prefsToggleShow: '+ Persistent preferences',
    prefsToggleHide: '− Hide preferences',
    prefsLabel: 'General rules for every briefing',
    prefsPlaceholder:
      'e.g. No graphic war details. At least 1 positive story. No celebrity news. Max 30% negative content. Only what materially changed since yesterday.',
    submit: 'Run',
    generating: 'Generating…',
    stories: (n) => `${n} ${n === 1 ? 'story' : 'stories'}`,
    generatedAt: (t) => `Generated at ${t}`,
    toneLabels: { positive: 'Positive', neutral: 'Neutral', concerning: 'Concerning' },
    modeLabels: { calm: 'Calm', balanced: 'Balanced', brave: 'Brave' },
    modeTooltip: 'Calm: gentle framing, max 3 stories, no graphic content.\nBalanced: honest coverage without sensationalism.\nBrave: full, unfiltered news awareness.\nSwitching mode after articles are loaded only affects follow-up answers, not the briefing.',
    categories: ['World', 'Politics', 'Economy', 'Technology', 'Science', 'Climate', 'Health', 'Sports', 'Culture', 'Business'],
    timeJustNow: 'Just now',
    timeHoursAgo: (h) => `${h}h ago`,
    timeYesterday: (time) => `Yesterday, ${time}`,
    whyItMatters: 'Why it matters',
    fromTheSource: 'From the source',
    readOriginal: 'Read original →',
    noResults: 'No recent articles found for your query. Try rephrasing or broadening your request.',
    noResultsForTopics: (topics) => `No recent articles found for: ${topics.join(', ')}.`,
    overallSummaryLabel: 'Overview',
    chatPlaceholder: 'Ask a follow-up question…',
    chatSend: 'Send',
    chatSending: 'Sending…',
  },
  cs: {
    tagline: 'Zůstaňte informováni bez emočního přetížení.',
    requestLabel: 'Co byste chtěli vědět?',
    requestPlaceholder: 'Např. Jaké jsou nejdůležitější zprávy dneška? Přidej jednu pozitivní zprávu.',
    prefsToggleShow: '+ Trvalé předvolby',
    prefsToggleHide: '− Skrýt předvolby',
    prefsLabel: 'Obecná pravidla pro každý přehled',
    prefsPlaceholder:
      'Např. Žádné grafické detaily o válce. Alespoň 1 pozitivní příběh. Žádné zprávy o celebritách. Max 30 % negativního obsahu. Jen co se od včerejška skutečně změnilo.',
    submit: 'Spustit',
    generating: 'Generuji…',
    stories: (n) => `${n} ${n === 1 ? 'příběh' : n < 5 ? 'příběhy' : 'příběhů'}`,
    generatedAt: (t) => `Vygenerováno v ${t}`,
    toneLabels: { positive: 'Pozitivní', neutral: 'Neutrální', concerning: 'Znepokojivé' },
    modeLabels: { calm: 'Klidný', balanced: 'Vyvážený', brave: 'Odvážný' },
    modeTooltip: 'Klidný: jemné podání, max 3 příběhy, žádný grafický obsah.\nVyvážený: upřímné zprávy bez senzacechtivosti.\nOdvážný: úplné, nefiltrované zpravodajství.\nPřepnutí režimu po načtení článků ovlivní pouze následující odpovědi, nikoli samotný přehled.',
    categories: ['Svět', 'Politika', 'Ekonomika', 'Technologie', 'Věda', 'Klima', 'Zdraví', 'Sport', 'Kultura', 'Byznys'],
    timeJustNow: 'Právě teď',
    timeHoursAgo: (h) => `před ${h}h`,
    timeYesterday: (time) => `Včera v ${time}`,
    whyItMatters: 'Proč je to důležité',
    fromTheSource: 'Ze zdroje',
    readOriginal: 'Přečíst originál →',
    noResults: 'Pro váš dotaz nebyly nalezeny žádné aktuální články. Zkuste dotaz přeformulovat nebo rozšířit.',
    noResultsForTopics: (topics) => `Žádné aktuální články nebyly nalezeny pro: ${topics.join(', ')}.`,
    overallSummaryLabel: 'Přehled',
    chatPlaceholder: 'Položte doplňující otázku…',
    chatSend: 'Odeslat',
    chatSending: 'Odesílám…',
  },
};
