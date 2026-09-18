import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./AdminApp.tsx', import.meta.url), 'utf8');
const operationCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');

describe('activation-code create form', () => {
  it('offers the approved quantities and all seven duration types to the appropriate role', () => {
    for (const value of ['1', '3', '5', '10', '20']) expect(appSource).toContain(`<option value="${value}">${value}</option>`);
    expect(appSource).toContain('<option value="7_days">7 天</option>');
    expect(appSource).toContain('<option value="15_days">15 天</option>');
    expect(appSource).toContain('<option value="30_days">30 天</option>');
    expect(appSource).toContain('<option value="60_days">60 天</option>');
    expect(appSource).toContain('<option value="90_days">90 天</option>');
    expect(appSource).toContain('<option value="365_days">365 天</option>');
    expect(appSource).toContain('<option value="lifetime">永久</option>');
    expect(appSource).toMatch(/isSuper\s*&&\s*\([\s\S]*?<option value="30_days">30 天<\/option>[\s\S]*?<option value="lifetime">永久<\/option>/);
  });

  it('uses a dedicated compact card instead of changing the shared form card density', () => {
    expect(appSource).toContain('className="formCard activationCodeFormCard"');
    expect(appSource).toContain('className="activationCodeFormGrid"');
    expect(appSource).toContain('className="primary activationCodeCreateButton"');
    expect(operationCss).toMatch(/\.activationCodeFormCard\s*\{[^}]*max-width:\s*520px[^}]*padding:\s*10px 12px/i);
    expect(operationCss).toMatch(/\.activationCodeFormGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i);
    expect(operationCss).toMatch(/\.activationCodeCreateButton\s*\{[^}]*height:\s*30px/i);
  });

  it('keeps the compact activation-code controls responsive on phones', () => {
    expect(operationCss).toMatch(/@media\(max-width:520px\)[\s\S]*\.activationCodeFormCard/);
    expect(operationCss).toMatch(/@media\(max-width:520px\)[\s\S]*\.activationCodeFormGrid/);
  });
});
