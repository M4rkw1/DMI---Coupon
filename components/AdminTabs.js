import { Children, cloneElement, useRef, useState } from 'react';

export default function AdminTabs({ children }) {
  const panels = Children.toArray(children);
  const [active, setActive] = useState(panels[0].props['data-tab']);
  const buttons = useRef({});

  function moveTab(event, index) {
    const last = panels.length - 1;
    const next = {
      ArrowRight: (index + 1) % panels.length,
      ArrowLeft: (index + last) % panels.length,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = panels[next].props['data-tab'];
    setActive(id);
    buttons.current[id]?.focus();
  }

  return (
    <>
      <div className="adminSectionTabs" role="tablist" aria-label="Admin sections">
        {panels.map((panel, index) => {
          const id = panel.props['data-tab'];
          return (
            <button key={id} type="button" role="tab" id={`admin-tab-${id}`}
              aria-controls={`admin-panel-${id}`} aria-selected={active === id}
              tabIndex={active === id ? 0 : -1}
              ref={element => { buttons.current[id] = element; }}
              onClick={() => setActive(id)} onKeyDown={event => moveTab(event, index)}>
              {panel.props['data-label']}
            </button>
          );
        })}
      </div>
      {panels.map(panel => {
        const id = panel.props['data-tab'];
        // Keep panels mounted so switching tabs preserves previews and form drafts.
        return cloneElement(panel, {
          id: `admin-panel-${id}`,
          role: 'tabpanel',
          'aria-labelledby': `admin-tab-${id}`,
          hidden: active !== id,
          tabIndex: 0,
          className: 'adminSectionPanel',
        });
      })}
    </>
  );
}
