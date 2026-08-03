import { supabase } from '../../../core/supabase/client'; // Assuming this is your Supabase client path
import { RuntimeErrorLog, AuditTrailLog } from './logging.types';

export const LoggerService = {
  // রানটাইম এরর লগ সেভ করার ফাংশন
  logError: async (log: RuntimeErrorLog) => {
    try {
      const { error } = await supabase
        .from('logs_runtime_error')
        .insert([log]);
      
      if (error) console.error('Failed to log error to Supabase:', error);
    } catch (e) {
      console.error('Critical failure in LoggerService:', e);
    }
  },

  // অ্যাডমিন অ্যাকশন লগ সেভ করার ফাংশন
  logAudit: async (log: AuditTrailLog) => {
    try {
      const { error } = await supabase
        .from('logs_audit_trail')
        .insert([log]);

      if (error) console.error('Failed to log audit trail:', error);
    } catch (e) {
      console.error('Critical failure in LoggerService:', e);
    }
  }
};
