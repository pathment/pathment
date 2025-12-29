import React from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  BookOpen,
  Star,
  X
} from 'lucide-react';

interface Notification {
  id: number;
  type: 'match' | 'task' | 'feedback' | 'deadline' | 'success' | 'info';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export default function NotificationPanel() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [notifications] = React.useState<Notification[]>([
    {
      id: 1,
      type: 'match',
      title: 'Mentor Match Confirmed',
      message: 'You have been matched with Sarah Johnson for Full Stack Development Bootcamp',
      time: '2 hours ago',
      read: false
    },
    {
      id: 2,
      type: 'task',
      title: 'New Task Assigned',
      message: 'Your mentor assigned "Build a React component library"',
      time: '5 hours ago',
      read: false
    },
    {
      id: 3,
      type: 'feedback',
      title: 'Feedback Received',
      message: 'Sarah Johnson reviewed your submission and rated it 5 stars',
      time: '1 day ago',
      read: true
    },
    {
      id: 4,
      type: 'deadline',
      title: 'Deadline Reminder',
      message: 'Task "Implement user authentication" is due in 2 days',
      time: '1 day ago',
      read: true
    },
    {
      id: 5,
      type: 'success',
      title: 'Task Completed',
      message: 'Congratulations! You completed "Build responsive landing page"',
      time: '2 days ago',
      read: true
    }
  ]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'match':
        return <UserCheck className="w-5 h-5 text-purple-600" />;
      case 'task':
        return <BookOpen className="w-5 h-5 text-blue-600" />;
      case 'feedback':
        return <Star className="w-5 h-5 text-yellow-600" />;
      case 'deadline':
        return <Clock className="w-5 h-5 text-orange-600" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-slate-600" />;
    }
  };

  const getNotificationBg = (type: string) => {
    switch (type) {
      case 'match':
        return 'bg-purple-100';
      case 'task':
        return 'bg-blue-100';
      case 'feedback':
        return 'bg-yellow-100';
      case 'deadline':
        return 'bg-orange-100';
      case 'success':
        return 'bg-green-100';
      default:
        return 'bg-slate-100';
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      {/* Notification Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-xl z-50">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-slate-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs">
                    {unreadCount} new
                  </span>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-6 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${
                    !notification.read ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getNotificationBg(notification.type)}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-slate-900 text-sm">{notification.title}</h4>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-slate-600 text-sm mb-2">{notification.message}</p>
                      <p className="text-slate-500 text-xs">{notification.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200">
              <button className="w-full text-center text-indigo-600 hover:text-indigo-700 text-sm">
                Mark all as read
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
