import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui/components/table";
import { useTranslation } from "react-i18next";
import CurrencyForm from "./basic-settings/currency-form";
import PrivacyPolicyForm from "./basic-settings/privacy-policy-form";
import SiteForm from "./basic-settings/site-form";
import TosForm from "./basic-settings/tos-form";
import LogCleanupForm from "./log-cleanup/log-cleanup-form";
import InterfaceForm from "./interface-settings/interface-form";
import InviteForm from "./user-security/invite-form";
import RegisterForm from "./user-security/register-form";
import VerifyCodeForm from "./user-security/verify-code-form";
import VerifyForm from "./user-security/verify-form";

export default function System() {
  const { t } = useTranslation("system");

  const formSections = [
    {
      title: t("basicSettings", "Basic Settings"),
      forms: [
        { component: SiteForm },
        { component: InterfaceForm },
        { component: CurrencyForm },
        { component: TosForm },
        { component: PrivacyPolicyForm },
      ],
    },
    {
      title: t("userSecuritySettings", "User & Security"),
      forms: [
        { component: RegisterForm },
        { component: InviteForm },
        { component: VerifyForm },
        { component: VerifyCodeForm },
      ],
    },
    {
      title: t("logSettings", "Log Settings"),
      forms: [{ component: LogCleanupForm }],
    },
  ];

  return (
    <div className="space-y-8">
      {formSections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          <h2 className="mb-4 font-semibold text-lg">{section.title}</h2>
          <Table>
            <TableBody>
              {section.forms.map((form, formIndex) => {
                const FormComponent = form.component;
                return (
                  <TableRow key={formIndex}>
                    <TableCell>
                      <FormComponent />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
