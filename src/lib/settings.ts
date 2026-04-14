import prisma from './prisma';

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  headingFont: string;
  bodyFont: string;
}

export interface SiteSettings {
  coupleName1: string;
  coupleName2: string;
  weddingDate: string;
  weddingTime: string;
  venueName: string;
  venueAddress: string;
  registryLinks: { name: string; url: string }[];
  rsvpDeadline: string;
  rsvpCloseAfterDeadline: boolean;
  qrCardWidth: number;
  qrCardHeight: number;
  sitePassword: string;
  mapUrl: string;
  homeBannerStyle: 'hero' | 'strip';
  siteTitle: string;
  siteDescription: string;
  venueLat: string;
  venueLng: string;
  eventsDisplayStyle: 'list' | 'timeline';
}

export interface FeatureSettings {
  perGuestSelection: boolean;
  songRequests: boolean;
  dietaryNotes: boolean;
  guestBook: string;
  guestPhotoUpload: boolean;
  plusOnes: boolean;
  sitePasswordEnabled: boolean;
}

const defaultTheme: ThemeSettings = {
  primaryColor: '139 90 43',
  secondaryColor: '180 148 115',
  accentColor: '212 175 55',
  backgroundColor: '255 253 250',
  foregroundColor: '55 48 42',
  headingFont: 'Playfair Display',
  bodyFont: 'Lato',
};

const defaultSite: SiteSettings = {
  coupleName1: 'Partner One',
  coupleName2: 'Partner Two',
  weddingDate: '',
  weddingTime: '',
  venueName: '',
  venueAddress: '',
  registryLinks: [],
  rsvpDeadline: '',
  rsvpCloseAfterDeadline: false,
  qrCardWidth: 2,
  qrCardHeight: 4,
  sitePassword: '',
  mapUrl: '',
  homeBannerStyle: 'strip',
  // Empty values opt into the auto-derived defaults computed in layout.tsx
  // (couple names + wedding date for the title, "Join us..." for description).
  siteTitle: '',
  siteDescription: '',
  // Optional lat/lng for the venue so the homepage can show a weather
  // forecast in the final week before the wedding.
  venueLat: '',
  venueLng: '',
  eventsDisplayStyle: 'list',
};

const defaultFeatures: FeatureSettings = {
  perGuestSelection: true,
  songRequests: true,
  dietaryNotes: true,
  guestBook: 'off',
  guestPhotoUpload: false,
  plusOnes: false,
  sitePasswordEnabled: false,
};

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getTheme(): Promise<ThemeSettings> {
  const settings = await prisma.setting.findMany({ where: { key: { startsWith: 'theme.' } } });
  const theme = { ...defaultTheme };
  for (const setting of settings) {
    const key = setting.key.replace('theme.', '') as keyof ThemeSettings;
    if (key in theme) {
      (theme as any)[key] = setting.value;
    }
  }
  return theme;
}

export async function saveTheme(updates: Partial<ThemeSettings>) {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) await setSetting(`theme.${key}`, value);
  }
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const settings = await prisma.setting.findMany({ where: { key: { startsWith: 'site.' } } });
  const site = { ...defaultSite };
  for (const setting of settings) {
    const key = setting.key.replace('site.', '') as keyof SiteSettings;
    if (key in site) {
      if (key === 'registryLinks') {
        try { (site as any)[key] = JSON.parse(setting.value); } catch { (site as any)[key] = []; }
      } else if (key === 'rsvpCloseAfterDeadline') {
        (site as any)[key] = setting.value === 'true';
      } else if (key === 'qrCardWidth' || key === 'qrCardHeight') {
        (site as any)[key] = parseFloat(setting.value) || defaultSite[key];
      } else if (key === 'homeBannerStyle') {
        (site as any)[key] = setting.value === 'hero' ? 'hero' : 'strip';
      } else if (key === 'eventsDisplayStyle') {
        (site as any)[key] = setting.value === 'timeline' ? 'timeline' : 'list';
      } else {
        (site as any)[key] = setting.value;
      }
    }
  }
  return site;
}

export async function saveSiteSettings(updates: Partial<SiteSettings>) {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await setSetting(`site.${key}`, strValue);
    }
  }
}

export async function getFeatures(): Promise<FeatureSettings> {
  const settings = await prisma.setting.findMany({ where: { key: { startsWith: 'feature.' } } });
  const features = { ...defaultFeatures };
  for (const setting of settings) {
    const key = setting.key.replace('feature.', '') as keyof FeatureSettings;
    if (key in features) {
      if (key === 'guestBook') {
        (features as any)[key] = setting.value;
      } else if (key === 'perGuestSelection' || key === 'songRequests' || key === 'dietaryNotes' || key === 'guestPhotoUpload' || key === 'plusOnes' || key === 'sitePasswordEnabled') {
        (features as any)[key] = setting.value === 'true';
      }
    }
  }
  return features;
}

export async function saveFeatures(updates: Partial<FeatureSettings>) {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) await setSetting(`feature.${key}`, String(value));
  }
}
