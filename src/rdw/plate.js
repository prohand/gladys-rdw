// -----------------------------------------------------------------------------
// Dutch licence plates ("kentekens").
//
// The RDW stores a plate without dashes, in capitals (`AB123C`): that form is
// the one queried and the one the device external ids are built from, so
// `ab-123-c`, `AB 123 C` and `AB123C` are the same vehicle. The dashed form is
// only for display.
// -----------------------------------------------------------------------------

// Every Dutch plate is 1 to 8 letters and digits once the dashes are gone
// (6 for nearly all of them; shorter or longer ones are special series).
const PLATE_REGEX = /^[A-Z0-9]{1,8}$/;

/**
 * The plate as the RDW stores it: capitals, no dash, no space.
 *
 * @param {unknown} raw what the user typed
 * @returns {string | null} the plate, or null when it cannot be one
 */
export function normalizePlate(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const plate = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return PLATE_REGEX.test(plate) ? plate : null;
}

/**
 * The plates of a list typed by the user: separated by commas, semicolons or
 * new lines; duplicates removed, order kept. Spaces never separate plates:
 * "12 XYZ 3" is one plate, written the way some people read it out.
 *
 * @param {unknown} raw the `plates` configuration field
 * @returns {{ plates: string[], invalid: string[] }}
 */
export function parsePlates(raw) {
  const plates = [];
  const invalid = [];
  const text = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';
  for (const part of text.split(/[,;\n\r]+/)) {
    const typed = part.trim();
    if (!typed) {
      continue;
    }
    const plate = normalizePlate(typed);
    if (!plate) {
      invalid.push(typed);
    } else if (!plates.includes(plate)) {
      plates.push(plate);
    }
  }
  return { plates, invalid };
}

/**
 * The plate with its dashes, as printed on the vehicle.
 *
 * Dutch plates group letters and digits ("sidecodes"): AB-123-C, 12-XYZ-3,
 * 1-ABC-23... Splitting at every change between letters and digits gives the
 * three groups directly, except for the older 2-2-2 series where two groups of
 * the same kind touch (AB-12-34 reads AB + 1234): the four-character group is
 * then cut in two.
 *
 * @param {string} plate normalized plate
 * @returns {string}
 */
export function formatPlate(plate) {
  const groups = plate.match(/[A-Z]+|[0-9]+/g) ?? [plate];
  if (plate.length === 6 && groups.length === 2) {
    const [first, second] = groups;
    if (first.length === 4) {
      return [first.slice(0, 2), first.slice(2), second].join('-');
    }
    if (second.length === 4) {
      return [first, second.slice(0, 2), second.slice(2)].join('-');
    }
  }
  if (plate.length === 6 && groups.length === 1) {
    return [plate.slice(0, 2), plate.slice(2, 4), plate.slice(4)].join('-');
  }
  return groups.length === 3 ? groups.join('-') : plate;
}
