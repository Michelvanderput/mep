export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Print mails in de terminal (ontwikkeling). */
export const consoleMailer: Mailer = {
  async send(mail) {
    console.log(`\n--- mail naar ${mail.to} ---\n${mail.subject}\n\n${mail.text}\n---\n`);
  },
};

/** Verzamelt mails in geheugen (tests). */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}

/** Verstuurt via Resend (https://resend.com). Het afzenderdomein moet daar geverifieerd zijn. */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(mail) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
      });
      if (!res.ok) throw new Error(`E-mail versturen mislukt (${res.status})`);
    },
  };
}
