'use server';

import * as z from 'zod';

const employerInterestSchema = z.object({
  companyName: z.string().min(2, "Company name is required."),
  contactName: z.string().min(2, "Contact name is required."),
  email: z.string().email("Please enter a valid email address."),
  employeeCount: z.string().min(1, "Please estimate the number of employees."),
  message: z.string().optional(),
});

type State = {
    message: string;
    success: boolean;
}


export async function submitEmployerInterest(prevState: State, formData: FormData): Promise<State> {
  const validatedFields = employerInterestSchema.safeParse({
    companyName: formData.get('companyName'),
    contactName: formData.get('contactName'),
    email: formData.get('email'),
    employeeCount: formData.get('employeeCount'),
    message: formData.get('message'),
  });

  if (!validatedFields.success) {
    // This is a simplified error handling. 
    // For a production app, you might want to map errors to specific fields.
    const firstError = validatedFields.error.issues[0]?.message;
    return {
      message: firstError || "Please correct the errors in the form.",
      success: false,
    };
  }
  
  const { companyName, contactName, email, employeeCount, message } = validatedFields.data;

  try {
    // --- THIS IS WHERE YOU'D SEND THE EMAIL ---
    // Example using a hypothetical email service:
    //
    // await resend.emails.send({
    //   from: 'onboarding@yourdomain.com',
    //   to: 'your-sales-email@yourdomain.com',
    //   subject: `New Employer Interest: ${companyName}`,
    //   html: `
    //     <p><strong>Company:</strong> ${companyName}</p>
    //     <p><strong>Contact:</strong> ${contactName}</p>
    //     <p><strong>Email:</strong> ${email}</p>
    //     <p><strong>Employees:</strong> ${employeeCount}</p>
    //     <p><strong>Message:</strong> ${message}</p>
    //   `
    // });
    
    console.log("Server Action: Received Employer Interest Submission");
    console.log({ companyName, contactName, email, employeeCount, message });
    // --- END OF EMAIL SENDING LOGIC ---

    return {
      message: "Thanks — we received your request. We’ll reach out shortly.",
      success: true,
    };

  } catch (error) {
    console.error("Error submitting employer interest:", error);
    return {
      message: "An unexpected error occurred. Please try again later.",
      success: false,
    };
  }
}
