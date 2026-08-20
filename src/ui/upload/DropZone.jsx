import { useRef, useState } from 'react';
import { Icon } from '../icons.jsx';

const ACCEPT = '.csv,.tsv,.txt,.json,.ndjson,.xlsx,text/csv,application/json';

/** Step 1: take a file. Parsing happens in the caller so this stays presentational. */
export function DropZone({ onFile, busy, error }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const take = (file) => { if (file) onFile(file); };

  return (
    <>
      <div
        className={`dropzone${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Icon name="cloud-upload" size={30} color="var(--teal-bar)" />
        </div>
        <p style={{ margin: '8px 0 3px', fontSize: 15, fontWeight: 500, color: 'var(--teal-deep)' }}>
          {busy ? 'Reading your file…' : 'Drop your grant portfolio here'}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--teal-text)' }}>
          CSV, Excel, or JSON · stays in your browser
        </p>
        <button className="btn btn-ghost" onClick={() => input.current?.click()} disabled={busy}>
          Choose file
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div className="note note-amber" style={{ marginBottom: '1.25rem' }}>
          <Icon name="alert-triangle" size={17} color="var(--amber-text)" style={{ marginTop: 1 }} />
          <div>
            <p className="note-title">That file could not be read</p>
            <p className="note-body">{error}</p>
          </div>
        </div>
      )}
    </>
  );
}

export default DropZone;
