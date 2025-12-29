import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, Mail, Bell, Calendar, Star, UserCheck, BookOpen } from 'lucide-react';

export default function SystemMessages() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-slate-900 mb-2">System Messages & Notifications</h1>
          <p className="text-slate-600">Preview of all notification and message types used throughout Pathment</p>
        </div>

        {/* Success Messages */}
        <div>
          <h2 className="text-slate-900 mb-4">Success Messages</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-900">Account created successfully!</p>
                  <p className="text-green-700 text-sm mt-1">Check your email to verify your account.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-900">Task submitted successfully!</p>
                  <p className="text-green-700 text-sm mt-1">Your mentor will review it within 24-48 hours.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-900">Feedback submitted!</p>
                  <p className="text-green-700 text-sm mt-1">Your mentee has been notified.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Messages */}
        <div>
          <h2 className="text-slate-900 mb-4">Error Messages</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-900">Login failed</p>
                  <p className="text-red-700 text-sm mt-1">Invalid email or password. Please try again.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-900">Email verification failed</p>
                  <p className="text-red-700 text-sm mt-1">The code you entered is incorrect.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Messages */}
        <div>
          <h2 className="text-slate-900 mb-4">Warning Messages</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-orange-900">Submission pending review for 48+ hours</p>
                  <p className="text-orange-700 text-sm mt-1">Please provide feedback to keep your mentee engaged.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-900">Task due in 2 days</p>
                  <p className="text-yellow-700 text-sm mt-1">Don't forget to submit "Implement user authentication".</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Messages */}
        <div>
          <h2 className="text-slate-900 mb-4">Info Messages</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-900">AI matching enabled</p>
                  <p className="text-blue-700 text-sm mt-1">Our AI will suggest the best mentor matches based on skills and availability.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-indigo-900">Demo credentials provided</p>
                  <p className="text-indigo-700 text-sm mt-1">Use the demo accounts to explore different role perspectives.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Email Notifications Preview */}
        <div>
          <h2 className="text-slate-900 mb-4">Email Notification Templates</h2>
          <div className="space-y-4">
            {/* Match Confirmation */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <UserCheck className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-slate-900 mb-1">Mentor Match Confirmed</h3>
                  <p className="text-slate-600 text-sm">
                    Congratulations! You've been matched with Sarah Johnson for the Full Stack Development Bootcamp. 
                    Your mentor will reach out to you shortly to schedule your first session.
                  </p>
                </div>
              </div>
              <div className="pl-16">
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                  View Your Mentor
                </button>
              </div>
            </div>

            {/* Task Assignment */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-slate-900 mb-1">New Task Assigned</h3>
                  <p className="text-slate-600 text-sm mb-3">
                    Your mentor Sarah Johnson has assigned you a new task: "Build a React component library"
                  </p>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Due: Feb 20, 2024
                    </span>
                  </div>
                </div>
              </div>
              <div className="pl-16">
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                  View Task Details
                </button>
              </div>
            </div>

            {/* Feedback Received */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <Star className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-slate-900 mb-1">Feedback Received</h3>
                  <p className="text-slate-600 text-sm mb-3">
                    Sarah Johnson reviewed your submission "Build responsive landing page" and gave you 5 stars!
                  </p>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="pl-16">
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                  Read Feedback
                </button>
              </div>
            </div>

            {/* Deadline Reminder */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Bell className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-slate-900 mb-1">Deadline Reminder</h3>
                  <p className="text-slate-600 text-sm mb-3">
                    Your task "Implement user authentication" is due in 2 days. Make sure to submit it on time!
                  </p>
                </div>
              </div>
              <div className="pl-16">
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                  Submit Task
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Toast Notifications */}
        <div>
          <h2 className="text-slate-900 mb-4">Toast Notifications</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-3">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-green-900 text-sm">Changes saved</span>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Info className="w-5 h-5 text-blue-600" />
                <span className="text-blue-900 text-sm">New notification received</span>
              </div>

              <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-yellow-900 text-sm">Please complete your profile</span>
              </div>

              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-900 text-sm">Failed to upload file</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
