'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileText,
  Download,
  User,
  Calendar,
  RotateCw
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function FeedbackProvision({ params }: PageProps) {
  use(params);
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [decision, setDecision] = useState<'approve' | 'revision' | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const submission = {
    id: 1,
    mentee: {
      name: 'Alex Thompson',
      program: 'Full Stack Development'
    },
    task: {
      title: 'Build a React component library',
      description: 'Create reusable React components with TypeScript. Include at least 5 different components (Button, Input, Card, Modal, Dropdown) with proper props and styling.',
      dueDate: '2024-02-20'
    },
    submittedDate: '2024-02-18',
    submission: {
      description: 'I built a comprehensive React component library with TypeScript. The library includes Button, Input, Card, Modal, Dropdown, and Tooltip components. Each component is fully typed with TypeScript interfaces, includes proper prop validation, and is responsive. I used CSS modules for styling and created a demo page to showcase all components. The biggest challenge was making the Modal component accessible with proper focus management and keyboard navigation.',
      links: [
        { title: 'GitHub Repository', url: 'https://github.com/alexthompson/component-library' },
        { title: 'Live Demo', url: 'https://component-library-demo.netlify.app' }
      ],
      files: [
        { name: 'component-screenshots.pdf', size: '2.4 MB' },
        { name: 'type-definitions.ts', size: '45 KB' }
      ]
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision || rating === 0) {
      alert('Please provide a rating and decision');
      return;
    }
    setShowSuccess(true);
    setTimeout(() => router.push('/mentor/tasks/review'), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => router.push('/mentor/tasks/review')}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Review Queue
      </button>

      {/* Success Message */}
      {showSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">Feedback submitted successfully!</p>
            <p className="text-green-700 text-sm mt-1">Your mentee will be notified.</p>
          </div>
        </div>
      )}

      {/* Mentee & Task Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-slate-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-slate-900 mb-1">{submission.mentee.name}</h2>
            <p className="text-slate-600 text-sm mb-3">{submission.mentee.program}</p>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Submitted {submission.submittedDate}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl">
          <h3 className="text-slate-900 mb-2">{submission.task.title}</h3>
          <p className="text-slate-600 text-sm">{submission.task.description}</p>
        </div>
      </div>

      {/* Submission Details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-slate-900 mb-4">Mentee&apos;s Submission</h2>
        
        {/* Description */}
        <div className="mb-6">
          <h3 className="text-slate-700 text-sm mb-2">Description</h3>
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-slate-700 leading-relaxed">{submission.submission.description}</p>
          </div>
        </div>

        {/* Links */}
        {submission.submission.links.length > 0 && (
          <div className="mb-6">
            <h3 className="text-slate-700 text-sm mb-3">Project Links</h3>
            <div className="space-y-2">
              {submission.submission.links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors"
                >
                  <ExternalLink className="w-5 h-5 text-indigo-600" />
                  <div className="flex-1">
                    <div className="text-indigo-900">{link.title}</div>
                    <div className="text-indigo-600 text-sm">{link.url}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        {submission.submission.files.length > 0 && (
          <div>
            <h3 className="text-slate-700 text-sm mb-3">Attached Files</h3>
            <div className="space-y-2">
              {submission.submission.files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-600" />
                    <div>
                      <div className="text-slate-900">{file.name}</div>
                      <div className="text-slate-500 text-sm">{file.size}</div>
                    </div>
                  </div>
                  <button className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feedback Form */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <h2 className="text-slate-900">Provide Feedback</h2>

          {/* Rating */}
          <div>
            <label className="block text-slate-900 mb-3">
              Rating <span className="text-red-600">*</span>
            </label>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="group"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= rating
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-slate-300 group-hover:text-yellow-400'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="text-slate-600 ml-2">{rating}/5</span>
              )}
            </div>
          </div>

          {/* Feedback Text */}
          <div>
            <label className="block text-slate-900 mb-2">
              Detailed Feedback <span className="text-red-600">*</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder="Provide constructive feedback. Include:&#10;&#10;**Strengths:**&#10;- What the mentee did well&#10;- Specific examples of good practices&#10;&#10;**Areas for Improvement:**&#10;- Specific suggestions for enhancement&#10;- Best practices to consider&#10;&#10;**Key Takeaways:**&#10;- What they should remember for future tasks"
              required
            />
            <p className="text-slate-500 text-sm mt-2">
              Markdown formatting is supported. Be specific and constructive in your feedback.
            </p>
          </div>

          {/* Decision */}
          <div>
            <label className="block text-slate-900 mb-3">
              Decision <span className="text-red-600">*</span>
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setDecision('approve')}
                className={`p-4 border-2 rounded-xl transition-all text-left ${
                  decision === 'approve'
                    ? 'border-green-600 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`w-6 h-6 shrink-0 ${decision === 'approve' ? 'text-green-600' : 'text-slate-600'}`} />
                  <div>
                    <div className={`mb-1 ${decision === 'approve' ? 'text-green-900' : 'text-slate-900'}`}>
                      Approve & Complete
                    </div>
                    <div className={`text-sm ${decision === 'approve' ? 'text-green-700' : 'text-slate-600'}`}>
                      Mark task as completed
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDecision('revision')}
                className={`p-4 border-2 rounded-xl transition-all text-left ${
                  decision === 'revision'
                    ? 'border-orange-600 bg-orange-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <RotateCw className={`w-6 h-6 shrink-0 ${decision === 'revision' ? 'text-orange-600' : 'text-slate-600'}`} />
                  <div>
                    <div className={`mb-1 ${decision === 'revision' ? 'text-orange-900' : 'text-slate-900'}`}>
                      Request Revision
                    </div>
                    <div className={`text-sm ${decision === 'revision' ? 'text-orange-700' : 'text-slate-600'}`}>
                      Ask for improvements
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Info Message */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-900 text-sm">
                Your mentee will receive an email notification with your feedback. Be constructive and specific to help them grow.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-4">
          <button
            type="submit"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            Submit Feedback
          </button>
          <button
            type="button"
            onClick={() => router.push('/mentor/tasks/review')}
            className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
