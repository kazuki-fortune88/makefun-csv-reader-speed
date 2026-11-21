// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// answer {columns, rows, errors} for an input {text, header}, but reads the text
// with native indexOf/slice scans instead of one character at a time.
//
// Semantics (mirroring csv-reader 1.0.0):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled
//     ("" inside it is one quote; each CRLF or lone CR inside it is one LF);
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that
//     never closes is a literal character and the text after it is read again
//     as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its field count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based
//     line its record starts on (every LF, CRLF and lone CR inside a quoted
//     field counted), row its record's index in rows (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Dependency-free ES module.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // A quoted-field segment with every CRLF or lone CR inside it turned into
  // one LF, counting the line breaks it holds. Segments without a line break
  // are returned untouched (the common case).
  function norm(seg) {
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return seg;
    let breaks = 0;
    for (let i = 0; i < seg.length; i++) {
      const ch = seg.charCodeAt(i);
      if (ch === 10) breaks++;
      else if (ch === 13 && seg.charCodeAt(i + 1) !== 10) breaks++;
    }
    line += breaks;
    return seg.replace(/\r\n?/g, '\n');
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept (not counting the
  // initial value, so a caller can tell whether junk followed a quote).
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let end = len;
      let ended = END;
      if (comma !== -1 && (lf === -1 || comma < lf)) {
        end = comma;
        ended = COMMA;
      } else if (lf !== -1) {
        end = lf;
        ended = LINE_BREAK;
      }
      // The candidate field text; a CR can only hide inside this slice, so
      // the search stays bounded by the field instead of running ahead.
      const probe = text.slice(pos, end);
      const cr = probe.indexOf('\r');
      if (cr !== -1) {
        if (cr === probe.length - 1 && ended === LINE_BREAK) {
          // CRLF: the CR is the line break's first half.
          value += probe.slice(0, cr);
          added += cr;
          pos = end + 1;
          line++;
          return { value, ended: LINE_BREAK, added };
        }
        error('stray_cr');
        value += probe.slice(0, cr);
        added += cr;
        pos += cr + 1;
        continue;
      }
      value += probe;
      added += probe.length;
      if (ended === COMMA) pos = end + 1;
      else if (ended === LINE_BREAK) {
        pos = end + 1;
        line++;
      } else {
        pos = end;
      }
      return { value, ended, added };
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let start = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // "" inside the field is one quote.
        value += norm(text.slice(start, q));
        value += '"';
        pos = q + 2;
        start = q + 2;
        continue;
      }
      value += norm(text.slice(start, q));
      pos = q + 1;
      break;
    }
    if (pos >= len) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Is the physical line starting at `from` a plain one: no quote opening a
  // field and no stray CR, so its fields are just its comma-separated parts?
  // Returns the segment (without a trailing CRLF's CR) or null.
  function plainLine(from) {
    const lf = text.indexOf('\n', from);
    const lineEnd = lf === -1 ? len : lf;
    let contentEnd = lineEnd;
    if (lf !== -1 && lineEnd > from && text.charCodeAt(lineEnd - 1) === 13) {
      contentEnd = lineEnd - 1;
    }
    const seg = text.slice(from, contentEnd);
    if (seg.indexOf('\r') !== -1) return null;
    let qi = seg.indexOf('"');
    while (qi !== -1) {
      if (qi === 0 || seg.charCodeAt(qi - 1) === 44) return null;
      qi = seg.indexOf('"', qi + 1);
    }
    return { seg, ended: lf === -1 ? END : LINE_BREAK, next: lf === -1 ? len : lf + 1 };
  }

  for (;;) {
    // Lines with no characters are no records.
    for (;;) {
      if (pos >= len) break;
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let quoted = false;
    const plain = plainLine(pos);
    if (plain !== null) {
      fields = plain.seg.split(',');
      pos = plain.next;
      if (plain.ended === LINE_BREAK) line += 1;
    } else {
      fields = [];
      let ended;
      do {
        quoted = text.charCodeAt(pos) === 34;
        const field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
        ended = field.ended;
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
