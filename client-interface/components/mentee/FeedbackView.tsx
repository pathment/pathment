import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import {
  ArrowLeft,
  Star,
  CheckCircle2,
  Calendar,
  User,
  FileText,
  ExternalLink,
  Download,
  ThumbsUp
} from 'lucide-react';

export default function FeedbackView() {
  const { id } = useParams();
  const navigate = useRouter();

  const taskFeedback = {
    task: {
      title: 'Build a responsive landing page',
      description: 'Create a fully responsive landing page using HTML5 and CSS3',
      submittedDate: '2024-02-09',
      reviewedDate: '2024-02-10',
      status: 'completed'
    },
    mentor: {
      name: 'Sarah Johnson',
      expertise: 'Full Stack Development',
      rating: 4.9
    },
    submission: {
      description: 'I built a responsive landing page for a fictional tech startup. The page includes a hero section, features section, testimonials, and a contact form. I used CSS Grid and Flexbox for the layout, and media queries for responsiveness. The biggest challenge was making the navigation menu work smoothly on mobile devices.',
      links: [
        'https://github.com/username/landing-page',
        'https://demo.landing-page.com'
      ],
      files: ['landing-page-screenshots.pdf']
    },
    feedback: {
      rating: 5,
      comment: `Excellent work on this landing page! Here's my detailed feedback:

**Strengths:**
- Clean and modern design that follows current web design trends
- Perfect responsive implementation across all breakpoints
- Semantic HTML structure is well-organized
- Smooth animations and transitions enhance user experience
- Great attention to accessibility (proper ARIA labels, keyboard navigation)

**Areas of Excellence:**
- The mobile navigation is beautifully implemented
- Color scheme is cohesive and professional
- Typography hierarchy is clear and effective
- Loading performance is excellent (scored 95+ on Lighthouse)

**Suggestions for Next Time:**
- Consider adding a dark mode toggle
- Could optimize images further using WebP format
- Add some micro-interactions on hover states

**Key Takeaways:**
Your understanding of responsive design principles is solid. Keep this attention to detail in your future projects!`,
      strengths: [
        'Clean, modern design',
        'Perfect responsive implementation',
        'Excellent accessibility',
        'Great performance optimization'
      ],
      improvements: [
        'Could add dark mode',
        'Further image optimization',
        'More micro-interactions'
      ]
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="mentee" />
      
      <div className="lg:pl-64">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <button
            onClick={() => navigate('/mentee/tasks')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Tasks
          </button>

          {/* Task Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-slate-900">{taskFeedback.task.title}</h1>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Completed
                  </span>
                </div>
                <p className="text-slate-600">{taskFeedback.task.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Submitted: {taskFeedback.task.submittedDate}
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Reviewed: {taskFeedback.task.reviewedDate}
              </span>
            </div>
          </div>

          {/* Rating & Feedback */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                  <span className="text-purple-700">
                    {taskFeedback.mentor.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <div className="text-slate-900 mb-1">{taskFeedback.mentor.name}</div>
                  <div className="text-slate-600 text-sm">{taskFeedback.mentor.expertise}</div>
                </div>
              </div>
              
              {/* Rating */}
              <div className="text-right">
                <div className="flex items-center gap-1 mb-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-6 h-6 ${
                        i < taskFeedback.feedback.rating
                          ? 'text-yellow-500 fill-yellow-500'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-slate-600 text-sm">{taskFeedback.feedback.rating}/5 Rating</div>
              </div>
            </div>

            {/* Feedback Comment */}
            <div className="p-5 bg-slate-50 rounded-xl mb-6">
              <h3 className="text-slate-900 mb-3">Mentor Feedback</h3>
              <div className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                {taskFeedback.feedback.comment}
              </div>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-5 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <ThumbsUp className="w-5 h-5 text-green-600" />
                  <h4 className="text-green-900">Strengths</h4>
                </div>
                <div className="space-y-2">
                  {taskFeedback.feedback.strengths.map((strength, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-green-800 text-sm">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2" />
                      <span>{strength}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h4 className="text-blue-900">For Next Time</h4>
                </div>
                <div className="space-y-2">
                  {taskFeedback.feedback.improvements.map((improvement, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-blue-800 text-sm">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2" />
                      <span>{improvement}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Your Submission */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4">Your Submission</h2>
            
            {/* Description */}
            <div className="mb-6">
              <h3 className="text-slate-700 text-sm mb-2">Description</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                {taskFeedback.submission.description}
              </p>
            </div>

            {/* Links */}
            {taskFeedback.submission.links.length > 0 && (
              <div className="mb-6">
                <h3 className="text-slate-700 text-sm mb-2">Project Links</h3>
                <div className="space-y-2">
                  {taskFeedback.submission.links.map((link, idx) => (
                    <a
                      key={idx}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {taskFeedback.submission.files.length > 0 && (
              <div>
                <h3 className="text-slate-700 text-sm mb-2">Attached Files</h3>
                <div className="space-y-2">
                  {taskFeedback.submission.files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-600" />
                        <span className="text-slate-900 text-sm">{file}</span>
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

          {/* Actions */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={() => navigate('/mentee/tasks')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
            >
              View All Tasks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
