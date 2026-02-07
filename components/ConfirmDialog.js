'use client'

import React from 'react'

const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border-2 border-slate-600 p-6 max-w-md w-full mx-4 shadow-2xl relative">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
          aria-label="Close confirmation dialog"
          type="button"
        >
          ×
        </button>
        <div className="text-center">
          <div className="text-4xl mb-2">⚔️</div>
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-slate-300 text-sm mb-5">{description}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition-all"
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-lg transition-all"
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
