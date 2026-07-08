import React, { useState, useRef, useEffect, useCallback, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Dropdown — custom styled select replacement
// ═══════════════════════════════════════════════════════════════
// Replaces native <select> for lists where styling control matters
// (long option lists, grouped options, themed scrollbars). Supports:
//   - Optional grouped options (rendered with non-selectable headers)
//   - Optional search/filter input
//   - Keyboard nav: ArrowUp/Down, Enter, Escape, Home/End
//   - Click-outside-to-close
//   - Max-height with themed scrollbar (ds-scroll class)
// ═══════════════════════════════════════════════════════════════

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional group header; options sharing a group render under it. */
  group?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show a search box at the top of the dropdown. */
  searchable?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /** Control the trigger button height: 'sm' (32px) or 'md' (36px). */
  size?: 'sm' | 'md';
  /** Custom render for the selected value's display label. */
  renderValue?: (opt: DropdownOption | undefined) => string;
  /** Max visible items before scrolling (controls max-height). */
  maxItems?: number;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = '— 选择 —',
  searchable = false,
  disabled = false,
  style,
  className,
  size = 'md',
  renderValue,
  maxItems = 8,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popupRect, setPopupRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = options.find(o => o.value === value);

  // Filter options by query (matches label or group).
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const normalizedQuery = query.toLowerCase();
    return options.filter(
      o =>
        o.label.toLowerCase().includes(normalizedQuery) ||
        (o.group && o.group.toLowerCase().includes(normalizedQuery)),
    );
  }, [options, query]);

  // Build a flat list of *selectable* options (excluding group headers)
  // for keyboard navigation indexing.
  const flatSelectable = filtered;

  // Close on outside click (also accounts for portal popup).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inWrapper = wrapRef.current?.contains(target);
      const inPopup = popupRef.current?.contains(target);
      if (!inWrapper && !inPopup) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Measure trigger position and reposition on scroll/resize while open.
  const updatePosition = useCallback(() => {
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPopupRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        setPopupRect(null);
      };
    }
    setPopupRect(null);
    return;
  }, [open, updatePosition]);

  // Reset active index when opening / when filter changes.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      setQuery('');
    }
  }, [open, options, value]);

  // Scroll active item into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(i => Math.min(i + 1, flatSelectable.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(i => Math.max(i - 1, 0));
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(flatSelectable.length - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < flatSelectable.length) {
            onChange(flatSelectable[activeIndex].value);
            setOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setQuery('');
          break;
      }
    },
    [open, activeIndex, flatSelectable, onChange],
  );

  // Render grouped: preserve option order, insert group headers.
  const renderList = () => {
    const items: React.ReactNode[] = [];
    let lastGroup: string | null = null;
    flatSelectable.forEach((opt, i) => {
      if (opt.group && opt.group !== lastGroup) {
        lastGroup = opt.group;
        items.push(
          <div
            key={`grp-${opt.group}`}
            style={{
              padding: 'var(--spacer-8) var(--spacer-12) var(--spacer-4)',
              fontSize: 'var(--body-xs-font-size)',
              fontWeight: 'var(--font-weight-strong)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              cursor: 'default',
              userSelect: 'none',
            }}
          >
            {opt.group}
          </div>,
        );
      }
      const isActive = i === activeIndex;
      const isSelected = opt.value === value;
      items.push(
        <div
          key={opt.value}
          data-idx={i}
          id={`${listboxId}-option-${i}`}
          role="option"
          aria-selected={isSelected}
          onClick={() => {
            onChange(opt.value);
            setOpen(false);
          }}
          onMouseEnter={() => setActiveIndex(i)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--spacer-8)',
            padding: 'var(--spacer-8) var(--spacer-12)',
            borderRadius: 'var(--radius-6)',
            fontSize: 'var(--body-base-font-size)',
            lineHeight: 'var(--body-base-line-height)',
            color: isSelected ? 'var(--text-brand)' : 'var(--text-default)',
            background: isActive
              ? 'var(--bg-overlay-l1)'
              : isSelected
                ? 'var(--bg-brand-popup)'
                : 'transparent',
            cursor: 'pointer',
            transition: 'background var(--transition-fast)',
            userSelect: 'none',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {opt.label}
          </span>
          {isSelected && <Check size={14} style={{ color: 'var(--text-brand)', flexShrink: 0 }} />}
        </div>,
      );
    });
    return items;
  };

  const displayLabel = selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder;
  const maxH = maxItems * 36 + (searchable ? 40 : 0) + 16;
  const triggerHeight = size === 'sm' ? 32 : 36;

  return (
    <div
      ref={wrapRef}
      className={`ds-dropdown${className ? ` ${className}` : ''}`}
      style={{ position: 'relative', width: '100%', ...style }}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        style={{
          width: '100%',
          height: triggerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacer-8)',
          padding: '0 var(--spacer-12)',
          borderRadius: 'var(--radius-8)',
          border: '1px solid var(--border-neutral-l1)',
          background: 'var(--bg-base-default)',
          color: selected ? 'var(--text-default)' : 'var(--text-tertiary)',
          fontSize: 'var(--body-base-font-size)',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          outline: open ? '2px solid var(--bg-brand-popup)' : 'none',
          outlineOffset: -1,
          transition: 'border-color var(--transition-fast), outline var(--transition-fast)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', flex: 1 }}>
          {displayLabel}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--icon-secondary)',
            flexShrink: 0,
            transition: 'transform var(--transition-normal)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Popup via portal (avoids parent scrollbar issues) */}
      {open && popupRect && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          id={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          style={{
            position: 'fixed',
            top: popupRect.top,
            left: popupRect.left,
            width: popupRect.width,
            zIndex: 99999,
            maxHeight: maxH,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 'var(--radius-8)',
            border: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-base-default)',
            boxShadow:
              '0 12px 32px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            animation: 'dsDropdownIn var(--transition-fast) ease',
          }}
        >
          {/* Search */}
          {searchable && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-6)',
                padding: 'var(--spacer-8) var(--spacer-12)',
                borderBottom: '1px solid var(--border-neutral-l1)',
                flexShrink: 0,
              }}
            >
              <Search size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜索提供商…"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-default)',
                  fontSize: 'var(--body-base-font-size)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* Options (scrollable) */}
          <div
            ref={listRef}
            className="ds-scroll"
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: 'var(--spacer-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacer-2)',
              flex: 1,
              minHeight: 0,
            }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: 'var(--spacer-16) var(--spacer-12)',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--body-sm-font-size)',
                }}
              >
                无匹配结果
              </div>
            ) : (
              renderList()
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
