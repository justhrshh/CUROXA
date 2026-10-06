import React, { useState } from 'react';
import { 
  Briefcase, Users, Calendar, Mail, Phone, FileText, Check, X, 
  Plus, Edit3, Award, ExternalLink, RefreshCcw, Send, CheckCircle, ChevronRight
} from 'lucide-react';

// Inline constant (formerly from constants.js)
const HOSPITAL_DEPARTMENTS = [
  'Cardiology', 'Pediatrics', 'Emergency Medicine', 'Critical Care / ICU',
  'Outpatient Services', 'Pathology & Lab', 'Pharmacy', 'Clinic Administration',
  'Obstetrics & Gynecology'
];

export default function RecruitmentView({
  jobs = [],
  setJobs,
  candidates = [],
  setCandidates
}) {
  const [activeRecTab, setActiveRecTab] = useState('Jobs');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Form states for creating new Job Opening
  const [isAddingJob, setIsAddingJob] = useState(false);
  const [newJob, setNewJob] = useState({
    title: 'Clinical Resident',
    department: 'Pediatrics',
    location: 'Main Wing - Building A',
    employmentType: 'Full-Time',
    experienceRequired: '3-5 Years',
    vacancies: 2
  });

  // Offer Letter Form states
  const [offerForm, setOfferForm] = useState({
    candidateName: 'Rebecca Green',
    jobTitle: 'ICU Staff Nurse',
    offeredCtc: 880000,
    joiningDate: '2026-08-01',
    gradeTier: 'G2 - Specialist Nurse',
    probationDays: 90
  });
  const [isOfferGenerated, setIsOfferGenerated] = useState(false);

  const handleCreateJob = (e) => {
    e.preventDefault();
    const id = `JOB-2026-00${jobs.length + 1}`;
    const entry = {
      id,
      title: newJob.title,
      department: newJob.department,
      location: newJob.location,
      employmentType: newJob.employmentType,
      experienceRequired: newJob.experienceRequired,
      vacancies: newJob.vacancies,
      status: 'Open',
      applicantsCount: 0,
      postedDate: '2026-07-08'
    };

    setJobs([entry, ...jobs]);
    setIsAddingJob(false);
    showToast(`Successfully posted new Job Opening: ${newJob.title}. Automatically indexed on public Careers Portal.`, 'success');
  };

  const handleUpdateCandidateStatus = (candId, nextStatus) => {
    setCandidates(prev => prev.map(c => {
      if (c.id === candId) {
        return {
          ...c,
          status: nextStatus,
          // Generate mock offer details if offered
          ...(nextStatus === 'Offered' ? {
            offerGenerated: true,
            offerDetails: {
              offeredCtc: 820000,
              joiningDate: '2026-08-15',
              generatedDate: '2026-07-08',
              status: 'Sent'
            }
          } : {})
        };
      }
      return c;
    }));
    showToast(`Candidate status updated successfully to "${nextStatus}". Automatic trigger sent to applicant email.`, 'success');
  };

  const handleGenerateOfferLetter = (e) => {
    e.preventDefault();
    setIsOfferGenerated(true);
    showToast('Healthcare official Offer Letter compiled successfully. Digital copy indexed and ready for signature.', 'success');
  };

  return (
    <div className="space-y-6" id="recruitment-workspace">
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
      
      {/* Subheader navigator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-3 gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Clinic Recruitment & Sourcing Portal</h1>
          <p className="text-slate-400 text-xs mt-0.5">Track specialized nurse and clinician applicant pipelines and issue contract offer letters.</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveRecTab('Jobs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeRecTab === 'Jobs' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Job Openings
          </button>
          <button
            onClick={() => setActiveRecTab('Candidates')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeRecTab === 'Candidates' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Applicant Pipeline
          </button>
          <button
            onClick={() => setActiveRecTab('Scheduler')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeRecTab === 'Scheduler' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Interview Scheduler
          </button>
          <button
            onClick={() => setActiveRecTab('Offers')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeRecTab === 'Offers' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            Offer Letters
          </button>
        </div>
      </div>

      {/* VIEW 1: Active Job Openings */}
      {activeRecTab === 'Jobs' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Active Sourcing Vacancies</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Vacancies active across inpatient departments and diagnostic laboratory wings.</p>
            </div>
            <button 
              onClick={() => setIsAddingJob(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Post New Opening
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center py-12">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-700 text-sm">No Active Job Openings</h4>
              <p className="text-slate-400 text-xs mt-1">There are no open positions currently posted. Click "Post New Opening" to create one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <div key={job.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded text-[9px] uppercase">
                        {job.department}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.status === 'Open' ? 'bg-emerald-50 text-emerald-700' :
                        job.status === 'Closed' ? 'bg-slate-100 text-slate-500' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {job.status}
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-slate-900 text-sm leading-snug">{job.title}</h4>
                    
                    <div className="space-y-1.5 text-xs text-slate-500">
                      <p>Required Exp: <span className="font-semibold text-slate-700">{job.experienceRequired}</span></p>
                      <p>Location: <span className="font-semibold text-slate-700">{job.location}</span></p>
                      <p>Openings: <span className="font-bold text-blue-600 font-mono">{job.vacancies} Vacancies</span></p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 mt-5 pt-4 flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono font-medium">{job.applicantsCount} Applicants Sourced</span>
                    <button 
                      onClick={() => {
                        setActiveRecTab('Candidates');
                        showToast(`Showing applicants sourced for: ${job.title}`, 'success');
                      }}
                      className="text-blue-600 hover:underline font-semibold flex items-center gap-0.5"
                    >
                      View Pipeline
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Job form modal */}
          {isAddingJob && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xl max-w-md w-full space-y-4 animate-fadeIn">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display font-bold text-slate-900 text-sm">Post New Clinical Vacancy</h3>
                    <p className="text-[10px] text-slate-400">Enter requisitions parameters for administrative or clinical boards.</p>
                  </div>
                  <button onClick={() => setIsAddingJob(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
                </div>

                <form onSubmit={handleCreateJob} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Official Job Title</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g., ICU Lead Staff Nurse"
                      value={newJob.title}
                      onChange={(e) => setNewJob({...newJob, title: e.target.value})}
                      className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Clinic Department</label>
                    <select
                      value={newJob.department}
                      onChange={(e) => setNewJob({...newJob, department: e.target.value})}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                    >
                      {HOSPITAL_DEPARTMENTS.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Geographical Location</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g., Main Wing - 4th Floor"
                      value={newJob.location}
                      onChange={(e) => setNewJob({...newJob, location: e.target.value})}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Vacancies</label>
                      <input 
                        type="number" 
                        required 
                        value={newJob.vacancies}
                        onChange={(e) => setNewJob({...newJob, vacancies: parseInt(e.target.value) || 1})}
                        className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-center font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Required Experience</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g., 2-5 Years"
                        value={newJob.experienceRequired}
                        onChange={(e) => setNewJob({...newJob, experienceRequired: e.target.value})}
                        className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => setIsAddingJob(false)}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm"
                    >
                      Post Vacancy
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* VIEW 2: Applicant Pipeline */}
      {activeRecTab === 'Candidates' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Hiring Applicant Sourcing Pipeline</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Move candidates across milestones from submission up to contract signature.</p>
          </div>

          {candidates.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center py-12">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-700 text-sm">No Active Candidates</h4>
              <p className="text-slate-400 text-xs mt-1">There are no candidates in the recruitment pipeline currently.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidates.map((cand) => (
                <div key={cand.id} className="p-4 bg-white rounded-xl border border-slate-100 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-blue-150 transition-colors">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold shrink-0">
                      {cand.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-800">{cand.name}</h4>
                      <p className="text-[11px] text-slate-500">Applied for: <span className="font-semibold text-slate-700">{cand.jobTitle}</span></p>
                      
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                        <span className="flex items-center gap-0.5"><Mail className="w-3.5 h-3.5" /> {cand.email}</span>
                        <span className="flex items-center gap-0.5"><Phone className="w-3.5 h-3.5" /> {cand.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                      cand.status === 'Applied' ? 'bg-slate-100 text-slate-600' :
                      cand.status === 'Interviewing' ? 'bg-blue-50 text-blue-700' :
                      cand.status === 'Offered' ? 'bg-amber-50 text-amber-700' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>
                      Pipeline: {cand.status}
                    </span>

                    {cand.status === 'Applied' && (
                      <button 
                        onClick={() => handleUpdateCandidateStatus(cand.id, 'Interviewing')}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-semibold"
                      >
                        Shortlist for Interview
                      </button>
                    )}

                    {cand.status === 'Interviewing' && (
                      <button 
                        onClick={() => handleUpdateCandidateStatus(cand.id, 'Offered')}
                        className="px-2.5 py-1 bg-amber-600 text-white rounded text-[10px] font-semibold"
                      >
                        Generate Formal Offer
                      </button>
                    )}

                    {cand.status === 'Offered' && (
                      <button 
                        onClick={() => handleUpdateCandidateStatus(cand.id, 'Hired')}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[10px] font-semibold"
                      >
                        Approve & Auto-Onboard
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Interview Scheduler */}
      {activeRecTab === 'Scheduler' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Scheduled Interview Board</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Assigned panel reviews and clinical trial consulting assessments.</p>
          </div>

          {candidates.filter(c => c.interviewSchedule).length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl py-12">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-700 text-sm">No Scheduled Interviews</h4>
              <p className="text-slate-400 text-xs mt-1">No candidate interviews are currently on the board.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidates.filter(c => c.interviewSchedule).map((cand) => {
                const sched = cand.interviewSchedule;
                return (
                  <div key={cand.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2.5">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-bold rounded uppercase">
                          {sched.roundName}
                        </span>
                        <h4 className="font-semibold text-xs text-slate-800">Interview with {cand.name}</h4>
                      </div>
                      <span className="font-semibold text-xs text-slate-600">{sched.date} at {sched.time}</span>
                    </div>

                    <p className="text-xs text-slate-500">Applicant: {cand.name} &bull; Applied for: <span className="font-semibold text-slate-700">{cand.jobTitle}</span></p>

                    <div className="text-[11px] bg-white p-2.5 border border-slate-100 rounded text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-800 block text-[10px] uppercase">Interviewer Assigned Panel</span>
                      {sched.interviewerName} &bull; Note: &ldquo;{sched.notes}&rdquo;
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: Offer Letter Generator */}
      {activeRecTab === 'Offers' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" id="recruitment-offers-root">
          
          {/* Inputs Panel */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Dynamic Contract Template Compiler</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Complete contract details below to pre-populate clinical appointment offer letters.</p>
            </div>

            <form onSubmit={handleGenerateOfferLetter} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Candidate Legal Name</label>
                <input 
                  type="text" 
                  required
                  value={offerForm.candidateName}
                  onChange={(e) => setOfferForm({...offerForm, candidateName: e.target.value})}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Assigned Designation</label>
                <input 
                  type="text" 
                  required
                  value={offerForm.jobTitle}
                  onChange={(e) => setOfferForm({...offerForm, jobTitle: e.target.value})}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Offered CTC (₹ INR)</label>
                  <input 
                    type="number" 
                    required 
                    value={offerForm.offeredCtc}
                    onChange={(e) => setOfferForm({...offerForm, offeredCtc: parseInt(e.target.value) || 0})}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Onboarding Date</label>
                  <input 
                    type="date" 
                    required 
                    value={offerForm.joiningDate}
                    onChange={(e) => setOfferForm({...offerForm, joiningDate: e.target.value})}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Grade Band Tier</label>
                  <input 
                    type="text" 
                    required
                    value={offerForm.gradeTier}
                    onChange={(e) => setOfferForm({...offerForm, gradeTier: e.target.value})}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Probation Days</label>
                  <input 
                    type="number" 
                    required 
                    value={offerForm.probationDays}
                    onChange={(e) => setOfferForm({...offerForm, probationDays: parseInt(e.target.value) || 90})}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-center font-semibold"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-center shadow-sm"
              >
                Compile and Preview Contract Letter
              </button>
            </form>
          </div>

          {/* Letter Output Panel */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-150 flex flex-col justify-between min-h-[450px]">
            {isOfferGenerated ? (
              <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-md space-y-4 text-[11px] leading-relaxed relative overflow-hidden text-slate-700 flex flex-col justify-between h-full">
                {/* Visual Official Letterhead */}
                <div className="border-b border-blue-500 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="font-display font-extrabold text-blue-600 text-xs">CUROXA CLINICAL CARE GROUP</h3>
                    <p className="text-[9px] text-slate-400">100 Clinical Parkway, Admin Block, Suite 400</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono font-semibold">REF: OFF-2026-NUR</span>
                </div>

                <div className="space-y-2 flex-1">
                  <p className="font-semibold">Date: July 08, 2026</p>
                  <p>To,</p>
                  <p className="font-bold text-slate-900">{offerForm.candidateName}</p>
                  <p className="font-semibold text-blue-700">Subject: Letter of Intent & Official Appointment as {offerForm.jobTitle}</p>
                  
                  <p>
                    Dear {offerForm.candidateName}, we are thrilled to extend an official offer of employment to join our nursing division 
                    as <span className="font-bold">{offerForm.jobTitle}</span> under grade tier <span className="font-semibold">{offerForm.gradeTier}</span>.
                  </p>

                  <p>
                    Your annual cost-to-company (CTC) compensation package is set at <span className="font-bold font-mono">₹{offerForm.offeredCtc.toLocaleString()}</span>, paid monthly, 
                    contingent on standard state tax withholdings. Your scheduled onboarding date is <span className="font-bold">{offerForm.joiningDate}</span>, 
                    following which you will undergo a <span className="font-bold">{offerForm.probationDays}-day probation evaluation period</span>.
                  </p>

                  <p>
                    Please sign below to formally indicate acceptance. We look forward to working together to deliver exceptional patient healthcare.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3 flex justify-between items-end text-[10px]">
                  <div>
                    <span className="font-semibold block text-slate-900">Dr. Michael Vance</span>
                    <span className="text-slate-400">Chief Executive Officer</span>
                  </div>
                  <div className="border-b border-dashed border-slate-300 w-32 pb-1 text-center text-slate-300">
                    Candidate Signature
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 flex flex-col items-center justify-center space-y-3">
                <FileText className="w-12 h-12 text-slate-300" />
                <h4 className="font-semibold text-slate-800 text-sm">Contract Compilation Output</h4>
                <p className="text-slate-400 text-xs px-6">Input candidate contract parameters in the compiler form and click "Compile" to generate the official letterhead document instantly.</p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
