'use client';

import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';

/**
 * CodeEditor — a real code editor (CodeMirror 6) with syntax highlighting, line
 * numbers and bracket matching, themed dark. Used by the interview runner (paste
 * disabled for anti-cheat) and re-usable read-only for reviewing code answers.
 */

/** Map a free-text language label to a CodeMirror language extension. */
function langExt(language?: string) {
  const l = (language || '').toLowerCase().trim();
  if (/^(ts|tsx|typescript)/.test(l)) return [javascript({ jsx: true, typescript: true })];
  if (/(javascript|^js|jsx|node|react)/.test(l)) return [javascript({ jsx: true })];
  if (/(python|^py)/.test(l)) return [python()];
  if (/^java\b/.test(l)) return [java()];
  if (/(c\+\+|cpp|cxx|^c\b|c#|csharp)/.test(l)) return [cpp()];
  if (/(sql|postgres|mysql|sqlite)/.test(l)) return [sql()];
  if (/html|xml/.test(l)) return [html()];
  if (/(css|scss|less)/.test(l)) return [css()];
  return [];
}

export function CodeEditor({
  value,
  language,
  onChange,
  onPasteBlocked,
  allowPaste = false,
  readOnly = false,
  minHeight = '360px',
  maxHeight,
}: {
  value: string;
  language?: string | null;
  onChange?: (value: string) => void;
  onPasteBlocked?: () => void;
  /** Let them paste and drop text (off by default: interviews and proctored quizzes block it). */
  allowPaste?: boolean;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
}) {
  // Block paste + drop (anti-cheat) unless read-only or allowed.
  const guards = readOnly || allowPaste
    ? []
    : [
        EditorView.domEventHandlers({
          paste(e) { e.preventDefault(); onPasteBlocked?.(); return true; },
          drop(e) { e.preventDefault(); return true; },
        }),
      ];

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      theme={oneDark}
      extensions={[...langExt(language || undefined), ...guards, EditorView.lineWrapping]}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        foldGutter: false,
        autocompletion: false,
        closeBrackets: !readOnly,
        bracketMatching: true,
      }}
      minHeight={minHeight}
      maxHeight={maxHeight}
      style={{ fontSize: 13 }}
    />
  );
}

export default CodeEditor;
