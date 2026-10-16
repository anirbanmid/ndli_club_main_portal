import React, { useState } from 'react';
import { 
  CalendarDays, 
  Clock, 
  MapPin, 
  Users, 
  Award, 
  Video, 
  BookOpen, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles,
  Filter
} from 'lucide-react';
import { ClubEvent } from '../types';

interface EventsViewProps {
  events: ClubEvent[];
  onStartQuiz: (event: ClubEvent) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({
  events,
  onStartQuiz,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedWebinar, setSelectedWebinar] = useState<ClubEvent | null>(null);
  const [enrolledEventIds, setEnrolledEventIds] = useState<string[]>([]);


  const categories = ['All', 'Quiz', 'Webinar', 'Reading Challenge', 'Workshop'];

  const filteredEvents = events.filter(e => 
    activeCategory === 'All' ? true : e.category === activeCategory
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Title & Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="inline-flex items-center space-x-2 bg-blue-50 border border-blue-200 text-blue-700 px-3.5 py-1 rounded-full text-xs font-bold mb-2">
            <CalendarDays className="h-4 w-4" />
            <span>National Digital Learning Calendar</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Club Activities, Quizzes & Research Masterclasses
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Participate from any verified institution in India to earn digital micro-credentials and NAAC extension points.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Live Webinar Simulator Modal */}
      {selectedWebinar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 text-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-800 space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-xs text-rose-400 font-bold">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping"></span>
                <span>NDLI LIVE WEBINAR BROADCAST (IIT KHARAGPUR)</span>
              </div>
              <button 
                onClick={() => setSelectedWebinar(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 bg-slate-800 rounded"
              >
                Close Stream
              </button>
            </div>

            {/* Video Player Mock */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center text-center p-6">
              <div className="space-y-3">
                <Video className="h-16 w-16 text-blue-500 mx-auto animate-pulse" />
                <h3 className="text-xl font-bold">{selectedWebinar.title}</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Broadcasting live via NDLI High-Definition Multi-Cast Network. Attendees are automatically logged for NAAC attendance verification.
                </p>
                <div className="inline-block px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  ✓ Attendance Logged: 100% Verified
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-400 pt-2">
              <span>Speaker: Dr. B. Sutradhar (PI, NDLI Project)</span>
              <span>Concurrent Viewers: 6,890 Active Students</span>
            </div>
          </div>
        </div>
      )}

      {/* Event Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredEvents.map(event => (
          <div
            key={event.id}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Card Banner Header */}
              <div className={`bg-gradient-to-r ${event.bannerGradient || 'from-emerald-900 to-teal-800'} p-5 text-white flex justify-between items-start`}>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider bg-black/25 px-2.5 py-0.5 rounded backdrop-blur-xs">
                    {event.category}
                  </span>
                  <div className="text-xs text-white/80 font-medium">
                    Organizer: {event.organizer || event.clubName}
                  </div>
                </div>

                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  event.status === 'Live' ? 'bg-emerald-500 text-white animate-pulse' :
                  event.status === 'Upcoming' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                  {event.status === 'Live' ? '● LIVE NOW' : event.status}
                </span>
              </div>

              {/* Event Body */}
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
                  {event.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                  {event.description}
                </p>

                {/* Event Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>{event.date}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>{event.time}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <Users className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>{event.participantsCount.toLocaleString()} Registered</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>Mode: {event.mode}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="px-6 pb-6 pt-2">
              {event.hasQuiz ? (
                <button
                  onClick={() => onStartQuiz(event)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01]"
                >
                  <Award className="h-4 w-4" />
                  <span>Take Assessment & Earn Certificate</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : event.category === 'Webinar' ? (
                <button
                  onClick={() => setSelectedWebinar(event)}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all"
                >
                  <Video className="h-4 w-4" />
                  <span>Join Live Webinar Stream</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!enrolledEventIds.includes(event.id)) {
                      setEnrolledEventIds([...enrolledEventIds, event.id]);
                    }
                  }}
                  className={`w-full py-3 rounded-xl font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all ${
                    enrolledEventIds.includes(event.id)
                      ? 'bg-emerald-700 text-white cursor-default'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>
                    {enrolledEventIds.includes(event.id)
                      ? '✓ Enrolled in Reading Log (Active)'
                      : 'Register & Track Reading Log'}
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

