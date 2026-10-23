/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Heart,
  Send,
  Plus,
  User,
  Image as ImageIcon,
  X,
  Loader2,
  MessageCircle,
  ChevronLeft,
  Trash2,
  Flag,
  Ban,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/lib/AuthContext';
import { cn } from '@/src/lib/utils';
import { useSocial, useComments, type FeedScope } from '@/src/lib/useSocial';
import { formatDistanceToNow, type Locale } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { api } from '@/src/lib/api';
import { formatUserError } from '@/src/lib/formatUserError';
import { useI18n } from '@/src/lib/i18n';
import EmptyState from '@/src/components/ui/EmptyState';
import {
  MobileOverlayRoot,
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

function formatSocialTimestamp(iso: string | undefined, loc: Locale, justNow: string): string {
  if (!iso) return justNow;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return justNow;
  return formatDistanceToNow(d, { addSuffix: true, locale: loc });
}

const CommentSection = ({ postId }: { postId: string }) => {
  const { comments, addComment } = useComments(postId);
  const { t, locale } = useI18n();
  const dfLoc = locale === 'de' ? dfDe : dfEnUS;
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addComment(content);
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-[var(--border-muted)] space-y-4">
      <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
        {comments.map(comment => (
          <div key={comment.id} className="flex gap-3">
            <div className="w-6 h-6 bg-[var(--foreground)] rounded-full flex-shrink-0 overflow-hidden">
              {comment.userPhoto ? (
                <img src={comment.userPhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--background)]">
                  <User size={12} />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="bg-[var(--background)] p-3 rounded-2xl rounded-tl-none inline-block max-w-full">
                <p className="text-[10px] font-black uppercase tracking-tight text-brand mb-0.5">{comment.userName}</p>
                <p className="text-xs text-[var(--text-primary)]">{comment.content}</p>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] font-black uppercase mt-1">
                {formatSocialTimestamp(comment.createdAt, dfLoc, t('social.time.justNow'))}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={t('social.commentPh')}
          className="flex-1 min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-2 text-base font-bold outline-none focus:border-brand touch-manipulation"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="ui-btn-brand p-2 rounded-xl disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

type SocialCounts = { followers: number; following: number; youFollow: boolean };

type InboxRow = { userId: string; displayName: string; photoURL: string; lastMessage: string; lastAt: string };

type DmRow = { id: string; senderId: string; body: string; createdAt: string };

function UserProfileSheet({
  userId,
  open,
  onClose,
  onMessage,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onMessage: (uid: string, name: string) => void;
}) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<{ displayName: string; photoURL: string } | null>(null);
  const [social, setSocial] = useState<SocialCounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  const [youBlocked, setYouBlocked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useMobileOverlaySheet(open);

  useEffect(() => {
    if (!userId || !open) return;
    setData(null);
    setSocial(null);
    setFollowError('');
    setLoadError(false);
    Promise.all([
      api<{ displayName: string; photoURL: string }>(`/api/users/${userId}`),
      api<SocialCounts>(`/api/users/${userId}/social`),
      api<{ youBlocked: boolean }>(`/api/users/${userId}/block`),
    ])
      .then(([u, s, b]) => {
        setData(u);
        setSocial(s);
        setYouBlocked(!!b.youBlocked);
      })
      .catch(() => {
        setLoadError(true);
      });
  }, [userId, open]);

  if (!open || !userId) return null;

  const isSelf = profile?.uid === userId;

  const toggleFollow = async () => {
    if (!social || isSelf || youBlocked) return;
    setBusy(true);
    setFollowError('');
    try {
      if (social.youFollow) {
        await api(`/api/users/${userId}/follow`, { method: 'DELETE' });
        setSocial({
          ...social,
          youFollow: false,
          followers: Math.max(0, social.followers - 1),
        });
      } else {
        await api(`/api/users/${userId}/follow`, { method: 'POST' });
        setSocial({
          ...social,
          youFollow: true,
          followers: social.followers + 1,
        });
      }
    } catch (err: unknown) {
      setFollowError(formatUserError(err, t, 'social.followFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    if (!userId || isSelf) return;
    setBusy(true);
    setFollowError('');
    try {
      if (youBlocked) {
        await api(`/api/users/${userId}/block`, { method: 'DELETE' });
        setYouBlocked(false);
      } else {
        await api(`/api/users/${userId}/block`, { method: 'POST' });
        setYouBlocked(true);
        if (social) setSocial({ ...social, youFollow: false });
      }
    } catch (err: unknown) {
      setFollowError(formatUserError(err, t, 'social.blockFailed'));
    } finally {
      setBusy(false);
    }
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-[var(--card-bg)] w-full max-w-md lg:rounded-[3rem] relative z-10 border-t lg:border border-[var(--border-muted)] max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col overflow-hidden rounded-t-[2rem] shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--background)] text-[var(--text-muted)]"
          aria-label={t('social.close')}
        >
          <X size={20} />
        </button>
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-8 pt-14 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:p-10 lg:pt-12 lg:pb-8">
          <div className="flex flex-col items-center gap-5">
            <div className="w-28 h-28 bg-[var(--background)] rounded-[2rem] overflow-hidden border-2 border-[var(--border-muted)]">
            {data?.photoURL ? (
              <img src={data.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                <User size={40} />
              </div>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">
              {data?.displayName || (loadError ? t('social.feed.error') : '…')}
            </h2>
            {loadError ? (
              <button
                type="button"
                className="mt-3 min-h-[44px] px-4 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest"
                onClick={() => {
                  setLoadError(false);
                  setData(null);
                  void Promise.all([
                    api<{ displayName: string; photoURL: string }>(`/api/users/${userId}`),
                    api<SocialCounts>(`/api/users/${userId}/social`),
                    api<{ youBlocked: boolean }>(`/api/users/${userId}/block`),
                  ])
                    .then(([u, s, b]) => {
                      setData(u);
                      setSocial(s);
                      setYouBlocked(!!b.youBlocked);
                    })
                    .catch(() => setLoadError(true));
                }}
              >
                {t('social.feed.retry')}
              </button>
            ) : null}
            {social && (
              <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest mt-2">
                {t('social.profile.followers', { followers: social.followers, following: social.following })}
              </p>
            )}
          </div>

          {followError && (
            <p className="text-xs font-bold text-red-600 text-center w-full">{followError}</p>
          )}

          {!isSelf && social && (
            <div className="grid grid-cols-2 gap-3 w-full">
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleFollow()}
                className={cn(
                  'min-h-[52px] rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all touch-manipulation',
                  social.youFollow ? 'bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-primary)]' : 'ui-btn-brand shadow-lg shadow-brand/20',
                )}
              >
                {social.youFollow ? t('social.following') : t('social.follow')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (data) onMessage(userId, data.displayName);
                  onClose();
                }}
                className="min-h-[52px] rounded-2xl font-black uppercase tracking-widest text-[11px] bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-primary)] hover:border-brand touch-manipulation"
              >
                {t('social.message')}
              </button>
            </div>
          )}

          {!isSelf && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleBlock()}
              className="w-full min-h-[48px] rounded-2xl border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Ban size={14} />
              {youBlocked ? t('social.unblock') : t('social.block')}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] py-3 min-h-[48px] touch-manipulation"
          >
            {t('social.close')}
          </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function DirectThreadModal({
  partnerId,
  partnerName,
  open,
  onClose,
}: {
  partnerId: string | null;
  partnerName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<DmRow[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useMobileOverlaySheet(open);

  const load = useCallback(async () => {
    if (!partnerId) return;
    const data = await api<DmRow[]>(`/api/messages/thread/${partnerId}`);
    setRows(data);
  }, [partnerId]);

  useEffect(() => {
    if (open && partnerId) void load();
  }, [open, partnerId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rows, open]);

  const send = async () => {
    if (!partnerId || !text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    setText('');
    try {
      await api('/api/messages', { method: 'POST', body: JSON.stringify({ recipientId: partnerId, body }) });
      await load();
    } finally {
      setSending(false);
    }
  };

  if (!open || !partnerId) return null;

  return overlayPortal(
    <div className={mobileSheetOverlayClass('items-stretch')}>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden border border-[var(--border-muted)] bg-[var(--card-bg)] lg:h-auto lg:max-h-[min(92dvh,720px)] lg:rounded-[2rem]"
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-muted)] bg-[var(--card-bg)] shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--background)] min-w-[44px] min-h-[44px]">
            <ChevronLeft size={22} />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('social.chat.header')}</p>
            <p className="font-black italic uppercase text-[var(--text-primary)]">{partnerName}</p>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-4 space-y-3">
          {rows.map(m => {
            const mine = m.senderId === profile?.uid;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-medium',
                    mine
                      ? 'ui-mark-selected rounded-br-md'
                      : 'bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-primary)] rounded-bl-md',
                  )}
                >
                  {m.body}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div
          className="p-3 border-t border-[var(--border-muted)] bg-[var(--card-bg)] flex gap-2 shrink-0 touch-manipulation"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void send()}
            placeholder={t('social.dm.placeholder')}
            className="flex-1 min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 text-base text-[var(--text-primary)] outline-none focus:border-brand"
          />
          <button
            type="button"
            disabled={sending || !text.trim()}
            onClick={() => void send()}
            className="min-h-[48px] min-w-[48px] ui-btn-brand rounded-xl flex items-center justify-center disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>,
  );
}

export default function SocialPage() {
  const { profile } = useAuth();
  const { t, locale } = useI18n();
  const dfLoc = locale === 'de' ? dfDe : dfEnUS;
  const [feedScope, setFeedScope] = useState<FeedScope>('following');
  const { posts, loading, feedError, createPost, toggleLike, deletePost, refetch } = useSocial(feedScope);
  const [activeTab, setActiveTab] = useState<'feed' | 'messages'>('feed');
  const [isPosting, setIsPosting] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postImage, setPostImage] = useState<string | null>(null);
  const [activeComments, setActiveComments] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [dmPartner, setDmPartner] = useState<{ id: string; name: string } | null>(null);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitReport = async () => {
    if (!reportPostId || reportBusy) return;
    setReportBusy(true);
    try {
      await api(`/api/posts/${reportPostId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      setReportPostId(null);
      setReportReason('');
    } finally {
      setReportBusy(false);
    }
  };

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const data = await api<InboxRow[]>('/api/messages/inbox');
      setInbox(data);
    } catch {
      setInbox([]);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'messages') void loadInbox();
  }, [activeTab, loadInbox]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setPostImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitPost = async () => {
    if (!postContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createPost(postContent, postImage || undefined);
      setIsPosting(false);
      setPostContent('');
      setPostImage(null);
    } finally {
      setSubmitting(false);
    }
  };

  const uid = profile?.uid ?? '';

  const confirmDeletePost = async () => {
    if (!postToDelete || deleteBusy) return;
    const id = postToDelete;
    setDeleteBusy(true);
    try {
      await deletePost(id);
      setActiveComments(cur => (cur === id ? null : cur));
      setPostToDelete(null);
    } catch {
      /* Rollback erfolgt in useSocial; Dialog bleibt offen */
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="min-h-[70dvh] flex flex-col gap-6 pb-4">
      <header className="flex flex-col gap-4 order-1 md:order-none">
        <div className="order-2 md:order-1">
          <h2 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{t('social.title')}</h2>
          <p className="text-[var(--text-muted)] font-medium uppercase text-[10px] tracking-[0.25em] mt-1">{t('social.subtitle')}</p>
        </div>
        <div className="flex bg-[var(--card-bg)] p-1 rounded-2xl border border-[var(--border-muted)] w-full sm:w-auto shrink-0 order-1 md:order-2">
          {[
            { id: 'feed' as const, labelKey: 'social.feed' },
            { id: 'messages' as const, labelKey: 'social.tab.chats' },
          ].map(tabItem => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setActiveTab(tabItem.id)}
              className={cn(
                'flex-1 sm:flex-none px-5 py-2.5 min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                activeTab === tabItem.id ? 'ui-btn-brand shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {t(tabItem.labelKey)}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'feed' && (
        <div className="space-y-5">
          <div className="flex gap-2 p-1 rounded-xl bg-[var(--background)] border border-[var(--border-muted)] w-full sm:w-auto">
            {([
              { id: 'following' as const, labelKey: 'social.feed.following' },
              { id: 'global' as const, labelKey: 'social.feed.global' },
            ]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFeedScope(tab.id)}
                className={cn(
                  'flex-1 sm:flex-none px-4 py-2 min-h-[40px] rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                  feedScope === tab.id ? 'ui-mark-selected' : 'text-[var(--text-muted)]',
                )}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          {loading && posts.length === 0 && (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="h-40 rounded-[2rem] bg-[var(--card-bg)] border border-[var(--border-muted)] animate-pulse" />
              ))}
            </div>
          )}
          {!loading && feedError && (
            <div className="rounded-[2rem] border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-8 text-center space-y-4">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">{t('social.feed.error')}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="min-h-[44px] px-6 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest"
              >
                {t('social.feed.retry')}
              </button>
            </div>
          )}
          {!loading && !feedError && posts.length === 0 && (
            <EmptyState
              icon={Plus}
              title={t('social.feed.emptyTitle')}
              description={
                feedScope === 'following' ? t('social.feed.emptyFollowing') : t('social.feed.emptyBody')
              }
              action={{
                label: t('social.fab.newPost'),
                onClick: () => setIsPosting(true),
              }}
            />
          )}
          {posts.map(post => (
            <article
              key={post.id}
              className="bg-[var(--card-bg)] p-5 sm:p-7 rounded-[2rem] border border-[var(--border-muted)] shadow-sm hover:border-[var(--text-muted)]/30 transition-colors"
            >
              <div className="flex justify-between items-start gap-3 mb-4">
                <button
                  type="button"
                  className="flex items-center gap-3 text-left min-h-[44px] flex-1 min-w-0"
                  onClick={() => setViewingUser(post.userId)}
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-[var(--background)] border border-[var(--border-muted)] shrink-0">
                    {post.userPhoto ? <img src={post.userPhoto} alt="" className="w-full h-full object-cover" /> : <User size={18} className="m-auto mt-2.5 text-[var(--text-muted)]" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black italic uppercase tracking-tight text-[var(--text-primary)] text-sm">{post.userName}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                      {formatSocialTimestamp(post.createdAt, dfLoc, t('social.time.justNow'))}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  {post.userId !== uid && (
                    <button
                      type="button"
                      onClick={() => setReportPostId(post.id)}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-amber-600 hover:bg-[var(--background)]"
                      aria-label={t('social.report.aria')}
                    >
                      <Flag size={18} />
                    </button>
                  )}
                  {post.userId === uid && (
                    <button
                      type="button"
                      onClick={() => setPostToDelete(post.id)}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--background)]"
                      aria-label={t('social.deletePost.aria')}
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[var(--text-primary)] leading-relaxed mb-4 whitespace-pre-wrap">{post.content}</p>

              {post.imageUrl && (
                <div className="mb-4 rounded-2xl overflow-hidden border border-[var(--border-muted)]">
                  <img src={post.imageUrl} alt="" className="w-full h-auto object-cover max-h-[420px]" />
                </div>
              )}

              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => void toggleLike(post.id, post.likes.includes(uid))}
                  className={cn(
                    'flex items-center gap-2 min-h-[44px] transition-colors',
                    post.likes.includes(uid) ? 'text-brand' : 'text-[var(--text-muted)] hover:text-brand',
                  )}
                >
                  <Heart size={22} fill={post.likes.includes(uid) ? 'currentColor' : 'none'} />
                  <span className="text-[10px] font-black uppercase">{post.likes.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveComments(activeComments === post.id ? null : post.id)}
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-brand min-h-[44px]"
                >
                  <MessageCircle size={22} />
                  <span className="text-[10px] font-black uppercase">{t('social.comments')}</span>
                </button>
              </div>

              <AnimatePresence>
                {activeComments === post.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <CommentSection postId={post.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          ))}
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] divide-y divide-[var(--border-muted)] overflow-hidden">
          {inboxLoading && (
            <div className="p-10 flex justify-center">
              <Loader2 className="animate-spin text-brand" size={32} />
            </div>
          )}
          {!inboxLoading && inbox.length === 0 && (
            <p className="p-10 text-center text-[10px] font-black uppercase text-[var(--text-muted)]">{t('social.inbox.empty')}</p>
          )}
          {!inboxLoading &&
            inbox.map(row => (
              <button
                key={row.userId}
                type="button"
                onClick={() => setDmPartner({ id: row.userId, name: row.displayName })}
                className="w-full flex items-center gap-4 p-4 hover:bg-[var(--background)] text-left min-h-[56px]"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--background)] border border-[var(--border-muted)] shrink-0">
                  {row.photoURL ? <img src={row.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="m-3 text-[var(--text-muted)]" size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black uppercase text-sm text-[var(--text-primary)] truncate">{row.displayName}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{row.lastMessage}</p>
                </div>
              </button>
            ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsPosting(true)}
        className="mobile-nav-fab fixed right-6 z-40 w-14 h-14 min-w-[56px] min-h-[56px] ui-btn-brand rounded-full flex items-center justify-center shadow-2xl shadow-brand/40 hover:scale-105 active:scale-95 transition-transform bottom-[calc(var(--shell-pad-bottom,6.5rem)+0.75rem)] lg:bottom-12 lg:right-12"
        aria-label={t('social.fab.newPost')}
      >
        <Plus size={28} />
      </button>

      <UserProfileSheet
        userId={viewingUser}
        open={!!viewingUser}
        onClose={() => setViewingUser(null)}
        onMessage={(id, name) => {
          setViewingUser(null);
          setDmPartner({ id, name });
        }}
      />

      <DirectThreadModal
        partnerId={dmPartner?.id ?? null}
        partnerName={dmPartner?.name ?? ''}
        open={!!dmPartner}
        onClose={() => setDmPartner(null)}
      />

      <MobileOverlayRoot open={reportPostId != null}>
        <div className={mobileSheetOverlayClass()}>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !reportBusy && setReportPostId(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 bg-[var(--card-bg)] w-full max-w-md rounded-[2rem] border border-[var(--border-muted)] p-8"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black italic uppercase tracking-tighter mb-2">{t('social.report.title')}</h3>
            <textarea value={reportReason} onChange={e => setReportReason(e.target.value)} rows={3} placeholder={t('social.report.placeholder')} className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 text-sm font-medium mb-4" />
            <div className="flex gap-3 justify-end">
              <button type="button" disabled={reportBusy} onClick={() => setReportPostId(null)} className="min-h-[44px] px-4 rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase">{t('profile.cancel')}</button>
              <button type="button" disabled={reportBusy} onClick={() => void submitReport()} className="min-h-[44px] px-4 rounded-xl ui-btn-brand text-[10px] font-black uppercase flex items-center justify-center gap-2">
                {reportBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                {reportBusy ? t('social.report.submitting') : t('social.report.submit')}
              </button>
            </div>
          </div>
        </div>
      </MobileOverlayRoot>

      <MobileOverlayRoot open={postToDelete != null}>
        <div className={mobileSheetOverlayClass()}>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !deleteBusy && setPostToDelete(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 bg-[var(--card-bg)] w-full max-w-md rounded-[2rem] border border-[var(--border-muted)] p-8"
          >
            <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)] mb-2">{t('social.delete.title')}</h3>
            <p className="text-sm text-[var(--text-muted)] font-medium mb-6">{t('social.delete.body')}</p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setPostToDelete(null)}
                className="min-h-[48px] px-6 rounded-xl font-black uppercase tracking-widest text-[10px] border border-[var(--border-muted)] text-[var(--text-primary)] hover:bg-[var(--background)] disabled:opacity-50"
              >
                {t('social.delete.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDeletePost()}
                className="min-h-[48px] px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteBusy ? <Loader2 size={18} className="animate-spin" /> : null}
                {deleteBusy ? t('social.delete.working') : t('social.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      </MobileOverlayRoot>

      <MobileOverlayRoot open={isPosting}>
        <div className={mobileSheetOverlayClass()}>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsPosting(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[var(--card-bg)] w-full max-w-lg lg:rounded-[3rem] p-8 lg:p-10 relative z-10 border-t lg:border border-[var(--border-muted)] flex flex-col gap-6 rounded-t-[2rem]"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{t('social.post.new')}</h3>
              <button type="button" onClick={() => setIsPosting(false)} className="p-2 hover:bg-[var(--background)] rounded-xl min-h-[44px] min-w-[44px]">
                <X size={20} />
              </button>
            </div>

            <textarea
              value={postContent}
              onChange={e => setPostContent(e.target.value)}
              placeholder={t('social.post.placeholder')}
              className="w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-2xl p-5 min-h-[140px] font-bold text-[var(--text-primary)] outline-none focus:border-brand resize-none"
            />

            {postImage && (
              <div className="relative rounded-2xl overflow-hidden border border-[var(--border-muted)] max-h-52">
                <img src={postImage} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setPostImage(null)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full">
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-[var(--text-muted)] hover:text-brand text-[10px] font-black uppercase tracking-widest min-h-[44px]"
              >
                <ImageIcon size={20} />
                {t('social.post.image')}
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

              <button
                type="button"
                onClick={() => void handleSubmitPost()}
                disabled={!postContent.trim() || submitting}
                className="ui-btn-brand px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50 min-h-[48px]"
              >
                {submitting ? t('social.post.submitting') : t('social.post.submit')}
              </button>
            </div>
          </div>
        </div>
      </MobileOverlayRoot>
    </div>
  );
}
