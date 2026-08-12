import { describe, it, expect } from 'vitest';
import { parseWhatsAppDate, formatSheetsDate } from '../historyImport/parseExport';
import { extractLinkedIn } from '../core/linkedinExtractor';

describe('Parser de fechas de WhatsApp', () => {
  it('Debería parsear correctamente fechas en formato de 12 horas con a. m. / p. m.', () => {
    // a. m.
    const dateAm = parseWhatsAppDate('11/8/2026', '10:12 a. m.', 'D/M/YYYY');
    expect(dateAm).not.toBeNull();
    expect(dateAm!.getFullYear()).toBe(2026);
    expect(dateAm!.getMonth()).toBe(7); // Agosto (0-indexed)
    expect(dateAm!.getDate()).toBe(11);
    expect(dateAm!.getHours()).toBe(10);
    expect(dateAm!.getMinutes()).toBe(12);

    // p. m.
    const datePm = parseWhatsAppDate('11/8/2026', '10:15 p. m.', 'D/M/YYYY');
    expect(datePm).not.toBeNull();
    expect(datePm!.getHours()).toBe(22);
    expect(datePm!.getMinutes()).toBe(15);
  });

  it('Debería manejar las 12 del mediodía y la medianoche', () => {
    const noon = parseWhatsAppDate('11/8/2026', '12:30 p. m.', 'D/M/YYYY');
    expect(noon!.getHours()).toBe(12);

    const midnight = parseWhatsAppDate('11/8/2026', '12:15 a. m.', 'D/M/YYYY');
    expect(midnight!.getHours()).toBe(0);
  });

  it('Debería soportar el formato configurable M/D/YYYY', () => {
    const dateUs = parseWhatsAppDate('8/11/2026', '10:12 a. m.', 'M/D/YYYY');
    expect(dateUs).not.toBeNull();
    expect(dateUs!.getMonth()).toBe(7); // Agosto
    expect(dateUs!.getDate()).toBe(11);
  });

  it('Debería formatear correctamente la fecha para Google Sheets', () => {
    const date = new Date(2026, 7, 11, 10, 12, 5);
    const formatted = formatSheetsDate(date);
    expect(formatted).toBe('2026-08-11 10:12:05');
  });
});

describe('Extractor de LinkedIn', () => {
  it('Debería extraer y normalizar enlaces de LinkedIn personales', () => {
    const msg = 'Hola les dejo mi LinkedIn: https://www.linkedin.com/in/edwin-esteban-pena-fonseca/';
    const res = extractLinkedIn(msg);
    expect(res).not.toBeNull();
    expect(res!.normalizedUrl).toBe('https://www.linkedin.com/in/edwin-esteban-pena-fonseca');
  });

  it('Debería extraer y normalizar enlaces con query params', () => {
    const msg = 'conectar en linkedin.com/in/juan-perez?utm_source=share&some=value';
    const res = extractLinkedIn(msg);
    expect(res).not.toBeNull();
    expect(res!.normalizedUrl).toBe('https://linkedin.com/in/juan-perez');
  });

  it('Debería soportar perfiles de tipo empresa', () => {
    const msg = 'Sigue nuestra empresa en https://linkedin.com/company/google/';
    const res = extractLinkedIn(msg);
    expect(res).not.toBeNull();
    expect(res!.normalizedUrl).toBe('https://linkedin.com/company/google');
  });

  it('Debería soportar enlaces acortados de lnkd.in', () => {
    const msg = 'Mi cv en lnkd.in/xyz123';
    const res = extractLinkedIn(msg);
    expect(res).not.toBeNull();
    expect(res!.normalizedUrl).toBe('https://lnkd.in/xyz123');
  });

  it('Debería retornar null si no hay enlaces de LinkedIn', () => {
    const msg = 'Hola, mi email es mail@test.com y mi web http://google.com';
    const res = extractLinkedIn(msg);
    expect(res).toBeNull();
  });
});
