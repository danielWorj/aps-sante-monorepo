// components/UploadZone.jsx
import { useState, useCallback } from 'react';

export default function UploadZone({ withPreview = false }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const applyFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    if (withPreview && f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    }
  }, [withPreview]);

  return (
    <div
      className={`upload-box ${file ? 'has-file' : ''} ${dragOver ? 'is-dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        applyFile(e.dataTransfer.files[0]);
      }}
    >
      {preview && <img src={preview} alt="Aperçu" />}
      <span className="upload-filename">{file?.name}</span>
      <input type="file" accept="image/*,.pdf" onChange={(e) => applyFile(e.target.files[0])} />
      {file && (
        <button type="button" className="upload-remove" onClick={() => { setFile(null); setPreview(null); }}>
          <i className="fa-solid fa-xmark" />
        </button>
      )}
    </div>
  );
}