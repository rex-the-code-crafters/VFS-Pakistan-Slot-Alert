import { launch } from '@cloudflare/playwright';
import type { Env, SlotResult } from './types';

const VFS_BASE = 'https://visa.vfsglobal.com/pak/en';

const CITIES = {
  lahore:    'Lahore',
  islamabad: 'Islamabad',
  karachi:   'Karachi',
};

// Routes × cities to monitor
export const MONITOR_ROUTES = [
  { route: 'pak-gbr', segment: 'gbr' },
  { route: 'pak-ita', segment: 'ita' },
  { route: 'pak-fra', segment: 'fra' },
  { route: 'pak-deu', segment: 'deu' },
  { route: 'pak-can', segment: 'can' },
  { route: 'pak-aus', segment: 'aus' },
  { route: 'pak-nld', segment: 'nld' },
];

export async function checkSlot(
  env: Env,
  route: string,
  segment: string,
  city: string = 'lahore'
): Promise<SlotResult> {
  const url = `${VFS_BASE}/${segment}/book-an-appointment`;
  let browser;

  try {
    browser = await launch(env.MYBROWSER);
    const page = await browser.newPage();

    // Rotate user agents to reduce detection
    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 25_000,
    });

    // Wait for VFS page to fully load (it uses React)
    await page.waitForTimeout(2000);

    const pageText = await page.innerText('body');

    // Primary detection: absence of "no slots" message
    const noSlotsText = [
      'No appointment slots are currently available',
      'no appointment available',
      'no slots available',
    ];

    const hasNoSlots = noSlotsText.some((t) =>
      pageText.toLowerCase().includes(t.toLowerCase())
    );

    // Secondary detection: look for date elements in calendar
    let availableDates: string[] = [];
    if (!hasNoSlots) {
      // Try to get actual available dates from calendar elements
      const dateElements = await page
        .locator('[class*="available"], [class*="open"], button[data-date]:not([disabled])')
        .all();

      for (const el of dateElements.slice(0, 10)) {
        const dateAttr = await el.getAttribute('data-date');
        const text = await el.innerText().catch(() => '');
        if (dateAttr) availableDates.push(dateAttr);
        else if (text.trim()) availableDates.push(text.trim());
      }
    }

    return {
      route,
      city,
      available: !hasNoSlots,
      dates: availableDates,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Scraper error for ${route}/${city}:`, err);
    // Return "no slot" on error — don't false-alert
    return {
      route,
      city,
      available: false,
      dates: [],
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}
