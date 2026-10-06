import React, { useState } from 'react';
import { Award, ShieldAlert, BadgeCheck, BookOpen, Clock, AlertTriangle, Check, RefreshCcw } from 'lucide-react';
export default function TrainingComplianceView() {
  const [courses, setCourses] = useState([]);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleStartTraining = (courseId) => {
    showToast(`Initiating simulator portal for: ${courseId}. Training progress tracked server-side.`, 'success');
    setCourses(prev => prev.map(c => {
      if (c.id === courseId) {
        return {
          ...c,
          status: 'Completed',
          completionDate: '2026-07-08',
          score: 100
        };
      }
      return c;
    }));
  };

  return (
    <div className="space-y-6" id="training-compliance-workspace">
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: toast.type === 'error' ? '#FEF2F2' : '#EFF6FF',
          border: toast.type === 'error' ? '1px solid #FCA5A5' : '1px solid #BFDBFE',
          borderRadius: '8px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: toast.type === 'error' ? '#EF4444' : '#2563EB'
          }}></div>
          <span style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: toast.type === 'error' ? '#991B1B' : '#1E40AF'
          }}>{toast.message}</span>
        </div>
      )}
      
      {/* Header */}
      <div>
        <h1 className="text-xl font-display font-bold text-slate-900">Clinic Certifications & Mandatory Training</h1>
        <p className="text-slate-400 text-xs mt-0.5">Track HIPAA guidelines, safety compliance, and professional license validity timers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Course cards register */}
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Required Compliance Courses</h3>
          
          {courses.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center py-12">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-700 text-sm">No Compliance Courses</h4>
              <p className="text-slate-400 text-xs mt-1">There are no active compliance training modules assigned currently.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course) => (
                <div key={course.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-blue-100 transition-colors">
                  <div className="flex gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs text-slate-800">{course.title}</h4>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-semibold">
                          {course.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{course.description}</p>
                      <p className="text-[10px] text-slate-400 mt-2 font-mono">
                        Due Date: <span className="font-semibold text-slate-600">{course.dueDate}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0 self-end sm:self-center">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                      course.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {course.status} {course.score ? `(${course.score}%)` : ''}
                    </span>

                    {course.status !== 'Completed' && (
                      <button
                        onClick={() => handleStartTraining(course.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold shadow-xs"
                      >
                        Start Training Refresher
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* License renewal side panel */}
        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Clinical Board Certifications</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Status of mandatory clinician state practicing licenses.</p>
            </div>

            <div className="space-y-3 text-xs">
              
              <div className="p-3.5 bg-white border border-slate-155 rounded-xl space-y-2 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-800">State Medical Board License</h4>
                  <p className="text-[11px] text-slate-400">Chief Cardiologist Jenkins (EMP-101) license expiring in 45 days.</p>
                  <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold mt-1 inline-block uppercase">
                    Renewal Prompt Sent
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-155 rounded-xl space-y-2 flex gap-3">
                <BadgeCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-800">State DEA Drug Administration License</h4>
                  <p className="text-[11px] text-slate-400">Head Pharmacist Smith (EMP-106) license verified through State Portal.</p>
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold mt-1 inline-block uppercase">
                    Verified Compliant
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* License verification sync alert */}
    </div>
  );
}
