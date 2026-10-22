// src/components/EditeurDocumentLegal.jsx
// Éditeur visuel (TipTap) des documents légaux. La barre d'outils est
// volontairement limitée à la STRUCTURE du texte (titres, listes, gras,
// liens…) : pas de couleur, de police ni de taille, la mise en forme est
// faite par le site public. Le serveur nettoie de toute façon le HTML
// reçu (server/src/lib/htmlDocumentLegal.js).
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useSaisie } from './feedback';

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    code: false,
    codeBlock: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['mailto', 'tel'],
      HTMLAttributes: { rel: null, target: null },
    },
  }),
];

function Bouton({ actif, desactive, onClick, titre, children }) {
  return (
    <button
      type="button"
      className={`edl-btn${actif ? ' is-active' : ''}`}
      title={titre}
      aria-label={titre}
      aria-pressed={actif ? 'true' : undefined}
      disabled={desactive}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function EditeurDocumentLegal({ contenu, onChange, lectureSeule = false }) {
  const saisir = useSaisie();
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: contenu,
    editable: !lectureSeule,
    immediatelyRender: true,
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
  });

  const etat = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
      gras: e.isActive('bold'),
      italique: e.isActive('italic'),
      souligne: e.isActive('underline'),
      puces: e.isActive('bulletList'),
      numeros: e.isActive('orderedList'),
      citation: e.isActive('blockquote'),
      lien: e.isActive('link'),
      annuler: e.can().undo(),
      retablir: e.can().redo(),
    }),
  });

  if (!editor) return null;
  const chaine = () => editor.chain().focus();

  async function gererLien() {
    const actuel = editor.getAttributes('link').href || '';
    const url = await saisir({
      titre: actuel ? 'Modifier le lien' : 'Ajouter un lien',
      label: 'Adresse (https://…, /contact, mailto:…, tel:…). Laissez vide pour retirer le lien.',
      valeurInitiale: actuel,
      placeholder: 'https://',
      labelConfirmer: 'Appliquer',
    });
    if (url === null) return;
    if (!url) {
      chaine().extendMarkRange('link').unsetLink().run();
      return;
    }
    chaine().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className={`edl${lectureSeule ? ' is-lecture' : ''}`}>
      {!lectureSeule && (
        <div className="edl-barre" role="toolbar" aria-label="Mise en forme">
          <Bouton titre="Paragraphe" actif={!etat.h2 && !etat.h3 && !etat.h4} onClick={() => chaine().setParagraph().run()}>¶</Bouton>
          <Bouton titre="Titre d'article" actif={etat.h2} onClick={() => chaine().toggleHeading({ level: 2 }).run()}>Article</Bouton>
          <Bouton titre="Sous-titre" actif={etat.h3} onClick={() => chaine().toggleHeading({ level: 3 }).run()}>Sous-titre</Bouton>
          <Bouton titre="Intertitre" actif={etat.h4} onClick={() => chaine().toggleHeading({ level: 4 }).run()}>Intertitre</Bouton>
          <span className="edl-sep" />
          <Bouton titre="Gras" actif={etat.gras} onClick={() => chaine().toggleBold().run()}><i className="fa-solid fa-bold" /></Bouton>
          <Bouton titre="Italique" actif={etat.italique} onClick={() => chaine().toggleItalic().run()}><i className="fa-solid fa-italic" /></Bouton>
          <Bouton titre="Souligné" actif={etat.souligne} onClick={() => chaine().toggleUnderline().run()}><i className="fa-solid fa-underline" /></Bouton>
          <span className="edl-sep" />
          <Bouton titre="Liste à puces" actif={etat.puces} onClick={() => chaine().toggleBulletList().run()}><i className="fa-solid fa-list-ul" /></Bouton>
          <Bouton titre="Liste numérotée" actif={etat.numeros} onClick={() => chaine().toggleOrderedList().run()}><i className="fa-solid fa-list-ol" /></Bouton>
          <Bouton titre="Encadré (citation)" actif={etat.citation} onClick={() => chaine().toggleBlockquote().run()}><i className="fa-solid fa-quote-left" /></Bouton>
          <Bouton titre="Lien" actif={etat.lien} onClick={gererLien}><i className="fa-solid fa-link" /></Bouton>
          <Bouton titre="Ligne de séparation" onClick={() => chaine().setHorizontalRule().run()}><i className="fa-solid fa-minus" /></Bouton>
          <span className="edl-sep" />
          <Bouton titre="Annuler" desactive={!etat.annuler} onClick={() => chaine().undo().run()}><i className="fa-solid fa-rotate-left" /></Bouton>
          <Bouton titre="Rétablir" desactive={!etat.retablir} onClick={() => chaine().redo().run()}><i className="fa-solid fa-rotate-right" /></Bouton>
        </div>
      )}
      <EditorContent editor={editor} className="edl-zone doc-legal-texte" />
    </div>
  );
}
