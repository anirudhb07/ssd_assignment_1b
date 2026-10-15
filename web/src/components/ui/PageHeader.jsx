import { useEffect } from 'react';

// Also names the browser tab after the page ("Wallet · BiteStream").
export function PageHeader({ title, description, actions }) {
  useEffect(() => {
    if (typeof title === 'string') document.title = title === 'BiteStream' ? title : `${title} · BiteStream`;
  }, [title]);

  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
