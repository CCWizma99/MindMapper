/**
 * RTF Parser — Extracts hierarchical tree structure from RTF files
 * Uses \li (left indent) values to determine depth: every 200 twips = 1 level
 */

function parseRTF(rtfText) {
  // Split into lines
  const lines = rtfText.split('\n');

  // We'll collect "blocks" — each block is a heading or a description paragraph
  const blocks = [];
  let currentIndent = 0;
  let inTextBlock = false;
  let textBuffer = '';
  let textIndent = 0;
  let isHeading = false;
  let isBoldHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect indent from \li<number>
    const liMatch = line.match(/\\li(\d+)/);
    if (liMatch) {
      currentIndent = parseInt(liMatch[1], 10);
    }

    // Detect heading start: {\b0\i0\fs24 or {\b\i0\fs28 (root title)
    const headingMatch = line.match(/\{\\b([01]?)\\i0\\fs(\d+)/);
    if (headingMatch) {
      // Flush any previous text block
      if (inTextBlock && textBuffer.trim()) {
        blocks.push({
          type: 'description',
          indent: textIndent,
          text: cleanText(textBuffer.trim())
        });
        textBuffer = '';
        inTextBlock = false;
      }
      isHeading = true;
      isBoldHeading = headingMatch[1] !== '0';
      continue;
    }

    // Detect smaller font heading: {\fs20
    const smallHeadingMatch = line.match(/^\{\\fs20$/);
    if (smallHeadingMatch) {
      if (inTextBlock && textBuffer.trim()) {
        blocks.push({
          type: 'description',
          indent: textIndent,
          text: cleanText(textBuffer.trim())
        });
        textBuffer = '';
        inTextBlock = false;
      }
      isHeading = true;
      isBoldHeading = false;
      continue;
    }

    // If we are reading a heading line, capture the text
    if (isHeading) {
      const cleanedLine = line.replace(/\}$/, '').trim();
      if (cleanedLine && !cleanedLine.startsWith('\\') && !cleanedLine.startsWith('{')) {
        blocks.push({
          type: 'heading',
          indent: currentIndent,
          text: cleanText(cleanedLine),
          bold: isBoldHeading
        });
      }
      isHeading = false;
      continue;
    }

    // Detect start of a description text block: {\slmult0\ltrpar\li<N>
    const descStartMatch = line.match(/^\{\\slmult0\\ltrpar\\li(\d+)$/);
    if (descStartMatch) {
      if (inTextBlock && textBuffer.trim()) {
        blocks.push({
          type: 'description',
          indent: textIndent,
          text: cleanText(textBuffer.trim())
        });
        textBuffer = '';
      }
      inTextBlock = true;
      textIndent = parseInt(descStartMatch[1], 10);
      continue;
    }

    // End of description block
    if (line.match(/^\\par\\pard\\plain\}$/)) {
      if (inTextBlock && textBuffer.trim()) {
        blocks.push({
          type: 'description',
          indent: textIndent,
          text: cleanText(textBuffer.trim())
        });
        textBuffer = '';
      }
      inTextBlock = false;
      continue;
    }

    // Accumulate text inside a description block
    if (inTextBlock) {
      const cleaned = line.replace(/\\par\\pard\\plain/, '').trim();
      if (cleaned && !cleaned.startsWith('\\') && cleaned !== '}') {
        textBuffer += (textBuffer ? '\n' : '') + cleaned;
      }
    }
  }

  // Now build a tree from the blocks
  // Root node
  const root = {
    name: 'MindMap',
    description: '',
    children: [],
    depth: -1,
    _collapsed: false
  };

  // Stack for building the tree
  const stack = [root];

  for (const block of blocks) {
    if (block.type === 'heading') {
      const depth = Math.round(block.indent / 200);

      const node = {
        name: block.text,
        description: '',
        children: [],
        depth: depth,
        _collapsed: false
      };

      // Find the right parent: pop stack until we find a node at a shallower depth
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (block.type === 'description') {
      // Attach description to the last heading at the same or compatible indent
      if (stack.length > 1) {
        const lastNode = stack[stack.length - 1];
        if (lastNode.description) {
          lastNode.description += '\n\n' + block.text;
        } else {
          lastNode.description = block.text;
        }
      }
    }
  }

  // If the root has only one child, promote it
  if (root.children.length === 1) {
    return root.children[0];
  }

  return root;
}

/**
 * Clean RTF control sequences from text
 */
function cleanText(text) {
  return text
    // Remove RTF unicode sequences like \u8217\'3f -> '
    .replace(/\\u(\d+)\\'[0-9a-f]{2}/g, (_, code) => String.fromCharCode(parseInt(code)))
    // Remove remaining RTF escapes
    .replace(/\\'[0-9a-f]{2}/g, '')
    // Remove \b, \i, \fs commands
    .replace(/\\[bi]\d*/g, '')
    .replace(/\\fs\d+/g, '')
    .replace(/\\u\d+/g, '')
    // Remove RTF special chars
    .replace(/\\~/g, ' ')
    .replace(/\\\-/g, '')
    .replace(/\\_/g, '')
    .replace(/\\lquote/g, '\u2018')
    .replace(/\\rquote/g, '\u2019')
    .replace(/\\ldblquote/g, '\u201C')
    .replace(/\\rdblquote/g, '\u201D')
    .replace(/\\endash/g, '\u2013')
    .replace(/\\emdash/g, '\u2014')
    .replace(/\\bullet/g, '\u2022')
    // HTML entities
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    // Remove remaining backslash commands
    .replace(/\\[a-z]+\d*\s?/gi, '')
    // Remove curly braces
    .replace(/[{}]/g, '')
    // Clean up ** markdown bold markers
    .replace(/\*\*/g, '')
    // Clean up ## markdown headings
    .replace(/^##\s*/gm, '')
    // Remove excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
