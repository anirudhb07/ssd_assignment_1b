import { describe, expect, it } from 'vitest';
import { cartLines, menuItems, toPaise, topupPaise } from './checkout.js';

describe('checkout money and menu safety', () => {
  it.each([NaN, Infinity, -Infinity, -1, '1', null, undefined, 100000000])('rejects invalid menu price %s', (price) => {
    expect(toPaise(price)).toBeNull();
  });
  it('calculates item/add-on quantities in paise without decimal drift', () => {
    const items = menuItems({ categories: [{ name: 'Food', items: [{ name: 'Tea', price: 0.1, customizationAddOns: [{ name: 'Milk', price: 0.2 }] }] }] });
    const lines = cartLines(items, { [items[0].key]: { quantity: 3, addOns: [0] } });
    expect(lines[0]).toMatchObject({ unit: 30, subtotal: 90, valid: true });
  });
  it.each(['', '0', '-1', 'Infinity', 'NaN', '0.001', '100000000', '1e2'])('rejects invalid top-up %s', (value) => {
    expect(topupPaise(value)).toBeNull();
  });
  it('converts decimal top-ups to paise', () => {
    expect(topupPaise('0.29')).toBe(29);
    expect(topupPaise('99999999.99')).toBe(9999999999);
  });
  it('invalidates a cart line when menu data changes instead of substituting another item', () => {
    const original = menuItems({ categories: [{ name: 'Food', items: [{ name: 'Tea', price: 10 }] }] });
    const updated = menuItems({ categories: [{ name: 'Food', items: [{ name: 'Coffee', price: 20 }] }] });
    expect(cartLines(updated, { [original[0].key]: { quantity: 1, addOns: [] } })[0].valid).toBeFalsy();
  });
});
