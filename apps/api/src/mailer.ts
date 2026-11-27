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
