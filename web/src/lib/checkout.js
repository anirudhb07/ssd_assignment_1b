// Menu and cart prices are calculated in integer paise; IDs are local to the
// menu because the API contract does not require item/add-on IDs.
export const MAX_PAISE = 9999999999;
export function toPaise(price) {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  const paise = Math.round(price * 100);
  return Number.isSafeInteger(paise) && paise <= MAX_PAISE ? paise : null;
}

export function menuItems(menu) {
  return (menu.categories ?? []).flatMap((category, ci) => (category.items ?? []).map((item, ii) => ({
    // A changed/reordered menu cannot silently replace an item or its add-ons
    // in an existing cart. The stale line becomes unavailable until removed.
    ...item, key: JSON.stringify([ci, ii, item]), categoryIndex: ci,
    paise: toPaise(item.price), addOns: (item.customizationAddOns ?? []).map((addon, index) => ({
      ...addon, index, paise: toPaise(addon.price),
    })),
  })));
}

export function cartLines(items, cart) {
  return Object.entries(cart).map(([key, selection]) => {
    const item = items.find((entry) => entry.key === key);
    const addOns = selection.addOns.map((index) => item?.addOns.find((addon) => addon.index === index));
    const valid = item && item.available !== false && item.paise !== null
      && addOns.every((addon) => addon && addon.available !== false && addon.paise !== null);
    const unit = valid ? item.paise + addOns.reduce((sum, addon) => sum + addon.paise, 0) : 0;
    return { key, item, ...selection, valid, unit, subtotal: unit * selection.quantity };
  });
}

export function topupPaise(text) {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const paise = toPaise(Number(text));
  return paise > 0 ? paise : null;
}
