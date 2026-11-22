// SwiftCSV: a fast drop-in for csv-reader 1.0.0, make.fun's own CSV reader.
//
// The same answers, on every input, as the reference — including every broken-row
// case it reports (stray CRs, junk after a closing quote, quotes that never close,
// short and long rows), with every error's line and row in the same order — at a
// fraction of the reference's CPU time.
//
// Where the speed comes from: the reference reads one character at a time and
// builds every field a character at a time. This reader instead
//   - takes whole clean records in one go: a record with no quote before its line
//     break is sliced out and split on commas by the engine's native split;
//   - jumps between special characters with indexOf instead of stepping through
//     ordinary characters one by one;
//   - slices quoted fields out whole and unescapes them with native replace calls
//     instead of rebuilding them character by character.
// Nothing about the answers changes: the errors are the reference's, recorded in
// the order they are met, and a record's short_row or long_row when it ends.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1; // a U+FEFF at the very start is dropped

  // The record being read: the line it starts on, and the index in rows it takes.
  let recLine = 1;
  let recRow = null;

  function fail(code) {
    errors.push({ code, line: recLine, row: recRow });
  }

  // Reads an unquoted field from pos, starting from `prefix`, and pushes the
  // finished field onto `fields`. Returns COMMA, BREAK or END. A CR that is not
  // part of a CRLF is dropped and reported (stray_cr). The field's end is found
  // by walking to the next comma, LF or CR — the walk stops at the first one, so
  // a field never costs more than its own length — and the characters kept are
  // sliced out in runs, never one by one.
  function readPlain(fields, prefix) {
    let value = prefix;
    for (;;) {
      let next = pos;
      let c = 0;
      while (next < len) {
        c = text.charCodeAt(next);
        if (c === 44 || c === 10 || c === 13) break;
        next += 1;
      }
      if (next >= len) {
        value += text.slice(pos, len);
        pos = len;
        fields.push(value);
        return END;
      }
      if (c === 13) {
        if (text.charCodeAt(next + 1) === 10) {
          // CRLF: a line break, the CR part of it.
          value += text.slice(pos, next);
          pos = next + 2;
          line += 1;
          fields.push(value);
          return BREAK;
        }
        // A lone CR: dropped, reported, and reading goes on after it.
        value += text.slice(pos, next);
        fail('stray_cr');
        pos = next + 1;
        continue;
      }
      value += text.slice(pos, next);
      if (c === 44) {
        pos = next + 1;
        fields.push(value);
        return COMMA;
      }
      pos = next + 1;
      line += 1;
      fields.push(value);
      return BREAK;
    }
  }

  // Reads a quoted field whose opening quote is at pos, and pushes the finished
  // field onto `fields`. Returns COMMA, BREAK or END.
  function readQuoted(fields) {
    const open = pos;
    // The closing quote: the next quote that is not doubled.
    let scan = open + 1;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', scan);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        scan = q + 2; // a doubled quote: one literal quote, keep looking
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as an unquoted field.
      fail('unterminated_quote');
      pos = open + 1;
      return readPlain(fields, '"');
    }
    let value = text.slice(open + 1, close);
    if (value.indexOf('\n') !== -1 || value.indexOf('\r') !== -1) {
      // Every line break inside the quotes counts, and each CRLF or lone CR
      // inside them reads as one LF.
      const breaks = value.match(/\r\n|\r|\n/g);
      line += breaks === null ? 0 : breaks.length;
      value = value.replace(/\r\n?/g, '\n');
    }
    if (value.indexOf('""') !== -1) value = value.replaceAll('""', '"');
    pos = close + 1;
    if (pos >= len) {
      fields.push(value);
      return END;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fields.push(value);
      return COMMA;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fields.push(value);
      return BREAK;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fields.push(value);
      return BREAK;
    }
    // Anything else up to the next comma or line break is junk, appended as it
    // stands; reported when the field ends, if anything was appended.
    const before = value.length;
    const ending = readPlain(fields, value);
    if (fields[fields.length - 1].length > before) fail('quote_junk');
    return ending;
  }

  // Files one finished record away. The first record sets the width (and is the
  // header when header is true); later records are padded or cut to it.
  function finishRecord(fields, quoted) {
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
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

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    const lf = text.indexOf('\n', pos);
    const lineEnd = lf === -1 ? len : lf;
    // The line as one slice (a view, not a copy): every check below stays
    // inside it, so no scan ever runs past the record.
    const lineText = text.slice(pos, lineEnd);
    if (lineText.indexOf('"') === -1) {
      // No quote before the next line break: no quoted field can be open, so
      // the whole record is this one line, split on commas.
      let content = lineText;
      if (lf !== -1 && content.charCodeAt(content.length - 1) === 13) {
        content = content.slice(0, -1); // the CR of a CRLF line break
      }
      const fields = content.split(',');
      if (content.indexOf('\r') !== -1) {
        // Stray CRs inside the line: each one is dropped and reported, in order.
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          if (f.indexOf('\r') !== -1) {
            const parts = f.split('\r');
            for (let k = 1; k < parts.length; k++) fail('stray_cr');
            fields[i] = parts.join('');
          }
        }
      }
      pos = lf === -1 ? len : lf + 1;
      if (lf !== -1) line += 1;
      finishRecord(fields, false);
      continue;
    }

    // A quote before the next line break: read field by field.
    const fields = [];
    let quoted = false;
    let ending;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        ending = readQuoted(fields);
      } else {
        quoted = false;
        ending = readPlain(fields, '');
      }
    } while (ending === COMMA);
    finishRecord(fields, quoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
