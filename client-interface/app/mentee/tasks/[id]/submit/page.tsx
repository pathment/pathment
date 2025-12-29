'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Link as LinkIcon,
  Upload,
  File,
  X,
  Send,
  CheckCircle2
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TaskSubmission({ params }: PageProps) {
  use(params);
  const router = useRouter();
  const [submission, setSubmission] = useState({
    description: '',
    links: [''],
    files: [] as File[]
  });
  const [showSuccess, setShowSuccess] = useState(false);

  const task = {
    id: 1,
    title: 'Build a React component library',
    description: 'Create reusable React components with TypeScript. Include at least 5 different components (Button, Input, Card, Modal, Dropdown) with proper props and styling.',
    dueDate: '2024-02-20',
    requirements: [
      'Minimum 5 components',
      'TypeScript implementation',
      'Responsive design',
      'Documentation for each component',
      'Demo/Storybook examples'
    ],
    resources: [
      { title: 'React TypeScript Cheatsheet', url: '#' },
      { title: 'Component Design Patterns', url: '#' }
    ]
  };

  const addLink = () => {
    setSubmission({ ...submission, links: [...submission.links, ''] });
  };

  const updateLink = (index: number, value: string) => {
    const newLinks = [...submission.links];
    newLinks[index] = value;
    setSubmission({ ...submission, links: newLinks });
  };

  const removeLink = (index: number) => {
    setSubmission({ ...submission, links: submission.links.filter((_, i) => i !== index) });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSubmission({ ...submission, files: [...submission.files, ...Array.from(e.target.files)] });
    }
  };

  const removeFile = (index: number) => {
    setSubmission({ ...submission, files: submission.files.filter((_, i) => i !== index) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuccess(true);
    setTimeout(() => router.push('/mentee/tasks'), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => router.push('/mentee/tasks')}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Tasks
      </button>

      {/* Success Message */}
      {showSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">Task submitted successfully!</p>
            <p className="text-green-700 text-sm mt-1">Your mentor will review it shortly.</p>
          </div>
        </div>
      )}

      {/* Task Details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-slate-900 mb-2">{task.title}</h1>
            <p className="text-slate-600 mb-4">{task.description}</p>
          </div>
          <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm whitespace-nowrap">
            Due: {task.dueDate}
          </span>
        </div>

        {/* Requirements */}
        <div className="mb-4">
          <h3 className="text-slate-900 mb-3">Requirements</h3>
          <div className="space-y-2">
            {task.requirements.map((req, idx) => (
              <div key={idx} className="flex items-start gap-2 text-slate-700">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2" />
                <span className="text-sm">{req}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
          <h4 className="text-indigo-900 text-sm mb-2">Learning Resources</h4>
          <div className="space-y-1">
            {task.resources.map((resource, idx) => (
              <a
                key={idx}
                href={resource.url}
                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm"
              >
                <LinkIcon className="w-4 h-4" />
                {resource.title}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Submission Form */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <h2 className="text-slate-900">Submit Your Work</h2>

          {/* Description */}
          <div>
            <label className="block text-slate-900 mb-2">
              Description <span className="text-red-600">*</span>
            </label>
            <textarea
              value={submission.description}
              onChange={(e) => setSubmission({ ...submission, description: e.target.value })}
              rows={8}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder="Describe your work, approach, challenges faced, and what you learned..."
              required
            />
            <p className="text-slate-500 text-sm mt-2">
              Be specific about your implementation and any decisions you made.
            </p>
          </div>

          {/* Project Links */}
          <div>
            <label className="block text-slate-900 mb-2">Project Links</label>
            <div className="space-y-3">
              {submission.links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => updateLink(index, e.target.value)}
                      className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="https://github.com/username/project or https://demo-url.com"
                    />
                    {submission.links.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLink(index)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addLink}
                className="text-indigo-600 hover:text-indigo-700 text-sm"
              >
                + Add another link
              </button>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-slate-900 mb-2">Attachments</label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-700 mb-1">Drop files here or click to browse</p>
              <p className="text-slate-500 text-sm mb-4">PDF, images, or ZIP files (Max 10MB)</p>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm cursor-pointer inline-block transition-colors"
              >
                Choose Files
              </label>
            </div>

            {/* File List */}
            {submission.files.length > 0 && (
              <div className="mt-4 space-y-2">
                {submission.files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <File className="w-5 h-5 text-slate-600" />
                      <div>
                        <div className="text-slate-900 text-sm">{file.name}</div>
                        <div className="text-slate-500 text-xs">{(file.size / 1024).toFixed(2)} KB</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            Submit Task
          </button>
          <button
            type="button"
            onClick={() => router.push('/mentee/tasks')}
            className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
