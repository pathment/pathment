'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, BookOpen, Calendar, Target, Users, Star, Loader2 } from 'lucide-react';
import { programManagementApi } from '@/lib/services/program-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';

export default function ProgramEnrollment() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [program, setProgram] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProgram();
      fetchLevels();
    }
  }, [id]);

  const fetchProgram = async () => {
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getById(id);
      const programData = response?.data?.program || response?.program || response;
      setProgram(programData);
    } catch (error: any) {
      console.error('Failed to fetch program:', error);
      toast.error('Failed to load program details');
    } finally {
      setLoading(false);
    }
  };

  const fetchLevels = async () => {
    try {
      const response = await programManagementApi.levels.getByProgram(id);
      const levelsList = response?.data?.levels || response?.levels || response || [];
      setLevels(Array.isArray(levelsList) ? levelsList : []);
    } catch (error: any) {
      console.error('Failed to fetch levels:', error);
    }
  };

  const handleEnroll = async () => {
    try {
      setEnrolling(true);
      await enrollmentApi.create({ programId: id });
      toast.success('Enrollment request submitted! Awaiting admin approval.');
      setShowConfirmDialog(false);
      setTimeout(() => router.push('/mentee/dashboard'), 1500);
    } catch (error: any) {
      console.error('Failed to enroll:', error);
      toast.error(error.response?.data?.message || 'Failed to submit enrollment request');
      setShowConfirmDialog(false);
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-slate-600 mb-4">Program not found</p>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="w-5 h-5" />
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      {/* Program Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-slate-900 mb-3">{program.name}</h1>
            <p className="text-slate-600 mb-4">{program.description}</p>
            <div className="flex flex-wrap gap-2">
              {program.skillTags?.map((skill: string) => (
                <span key={skill} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-6 p-6 bg-slate-50 rounded-xl">
          <div className="text-center">
            <div className="text-slate-900 text-2xl mb-1">{program.currentEnrollments || 0}</div>
            <div className="text-slate-600 text-sm flex items-center justify-center gap-1">
              <Users className="w-4 h-4" />
              Enrolled
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-900 text-2xl mb-1">{program.difficultyLevel || 'N/A'}</div>
            <div className="text-slate-600 text-sm flex items-center justify-center gap-1">
              <Target className="w-4 h-4" />
              Level
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-900 text-2xl mb-1">{program.totalDurationWeeks || 0}</div>
            <div className="text-slate-600 text-sm">Weeks</div>
          </div>
        </div>
      </div>

      {/* Program Details */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4">Program Information</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-slate-600 text-sm">Duration</div>
                <div className="text-slate-900">{program.totalDurationWeeks} weeks</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-slate-600 text-sm">Level</div>
                <div className="text-slate-900">{program.difficultyLevel || 'Not specified'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-slate-600 text-sm">Time Commitment</div>
                <div className="text-slate-900">{program.estimatedHoursPerWeek || 0} hrs/week</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-slate-600 text-sm">Program Levels</div>
                <div className="text-slate-900">{levels.length} levels</div>
              </div>
            </div>
          </div>
        </div>

        {/* Curriculum Preview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4">Program Levels</h2>
          <div className="space-y-3">
            {levels.slice(0, 3).map((level: any) => (
              <div key={level.id} className="p-4 border border-slate-200 rounded-xl">
                <div className="text-slate-900 mb-1">{level.name}</div>
                <div className="text-slate-600 text-sm">{level.durationWeeks} weeks · Level {level.levelOrder}</div>
              </div>
            ))}
            {levels.length > 3 && (
              <div className="text-center text-slate-600 text-sm pt-2">
                + {levels.length - 3} more levels
              </div>
            )}
            {levels.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-4">
                No levels defined yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enrollment CTA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-slate-900 mb-3">Ready to Start Your Journey?</h2>
          <p className="text-slate-600 mb-6">
            Submit your enrollment request and our admin team will review it. Once approved, you'll be matched with an expert mentor.
          </p>
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={enrolling}
            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
          >
            {enrolling ? 'Submitting...' : 'Request Enrollment'}
          </button>
          <p className="text-slate-500 text-sm mt-4">
            Admin will review your request within 24-48 hours
          </p>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-slate-900 text-center mb-3">Confirm Enrollment Request</h2>
            <p className="text-slate-600 text-center mb-6">
              Submit enrollment request for <strong>{program.name}</strong>. The admin will review and approve your request before mentor matching.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={enrolling}
                className="flex-1 px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEnroll}
                disabled={enrolling}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
              >
                {enrolling ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  'Submit Request'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
