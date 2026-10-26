import en from '../i18n/en.json';

const locale = en; // future locale loading

export function t(key: string): string {
  return (locale as any)[key] ?? key;
}
