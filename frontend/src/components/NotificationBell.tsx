import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Clock, UserCheck, AlertTriangle, Building2, ExternalLink } from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: 'succession' | 'reminder' | 'renewal' | 'approval' | 'system';
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  actionTab?: string;
}

interface NotificationBellProps {
  notifications?: NotificationItem[];
  onNavigateTab?: (tab: string) => void;
  variant?: 'light' | 'dark';
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications: initialNotifications,
  onNavigateTab,
  variant = 'light',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultNotifications: NotificationItem[] = [
    {
      id: 'notif-1',
      type: 'succession',
      title: 'Authority Succession Request',
      description: 'New leadership transition nominee pending review & charter re-signing.',
      timestamp: '10 mins ago',
      read: false,
      actionTab: 'succession',
    },
    {
      id: 'notif-2',
      type: 'reminder',
      title: 'Active Issue Reminders Due',
      description: 'Zonal nodal follow-up required on open support tickets.',
      timestamp: '1 hour ago',
      read: false,
      actionTab: 'grievances',
    },
    {
      id: 'notif-3',
      type: 'renewal',
      title: 'Annual Validity Renewal Window',
      description: 'Campus clubs due for validity extension this quarter.',
      timestamp: 'Today',
      read: false,
      actionTab: 'search',
    },
  ];

  const [items, setItems] = useState<NotificationItem[]>(
    initialNotifications && initialNotifications.length > 0 ? initialNotifications : defaultNotifications
  );

  useEffect(() => {
    if (initialNotifications && initialNotifications.length > 0) {
      setItems(initialNotifications);
    }
  }, [initialNotifications]);

  const unreadCount = items.filter((i) => !i.read).length;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllAsRead = () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const handleItemClick = (item: NotificationItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, read: true } : i))
    );
    if (item.actionTab && onNavigateTab) {
      onNavigateTab(item.actionTab);
      setIsOpen(false);
    }
  };

  const isDark = variant === 'dark';

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={`Notifications (${unreadCount} unread)`}
        style={{
          position: 'relative',
          background: isDark ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #D1E5DC',
          color: isDark ? '#ffffff' : '#103125',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.2s ease',
          boxShadow: isDark ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}
        aria-label="Open notifications menu"
        aria-expanded={isOpen}
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              backgroundColor: '#EF4444',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 800,
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isDark ? '2px solid #103125' : '2px solid #ffffff',
              boxShadow: '0 0 0 1px rgba(239, 68, 68, 0.4), 0 2px 4px rgba(239, 68, 68, 0.5)',
              animation: 'pulse 2s infinite',
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '340px',
            maxWidth: '92vw',
            background: '#ffffff',
            borderRadius: '14px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid #E2ECE7',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            textAlign: 'left',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#F4F8F6',
              borderBottom: '1px solid #E2ECE7',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#103125' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: '#EF4444',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0D7751',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 0,
                }}
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          {/* List items */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                No notifications right now.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  style={{
                    padding: '0.85rem 1rem',
                    borderBottom: '1px solid #F1F5F9',
                    background: item.read ? '#ffffff' : '#F0F9F5',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      background:
                        item.type === 'succession'
                          ? '#EEF2FF'
                          : item.type === 'reminder'
                          ? '#FEF3C7'
                          : '#ECFDF5',
                      color:
                        item.type === 'succession'
                          ? '#4F46E5'
                          : item.type === 'reminder'
                          ? '#B45309'
                          : '#0D7751',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {item.type === 'succession' ? (
                      <UserCheck className="h-4 w-4" />
                    ) : item.type === 'reminder' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: item.read ? 600 : 700,
                          color: '#0F172A',
                        }}
                      >
                        {item.title}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{item.timestamp}</span>
                    </div>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B', lineHeight: 1.35 }}>
                      {item.description}
                    </p>
                  </div>
                  {!item.read && (
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: '#0D7751',
                        marginTop: '6px',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
