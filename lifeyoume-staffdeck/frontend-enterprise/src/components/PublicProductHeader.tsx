import { ArrowLeft } from "lucide-react";

import { BRAND } from "../config/brand";
import { appPath } from "../lib/app-path";
import BrandLogo from "./BrandLogo";
import LanguageSwitcher from "./LanguageSwitcher";

export default function PublicProductHeader({
  destination = "catalog",
}: {
  destination?: "catalog" | "product";
}) {
  const productHome = destination === "product";
  return (
    <header className="relative z-10 flex h-[64px] shrink-0 items-center justify-between border-b border-black/5 px-[20px] sm:px-[32px]">
      <BrandLogo markSize={28} />
      <div className="flex items-center gap-[6px] sm:gap-[8px]">
        <a
          href={productHome ? appPath("/") : BRAND.productsUrl}
          aria-label={productHome ? "返回产品首页" : "返回产品目录"}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-[7px] rounded-full px-[10px] py-[8px] text-[13px] font-medium text-[#464c5e] transition-colors hover:bg-black/5 hover:text-[#111411] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411] sm:px-[12px]"
        >
          <ArrowLeft className="size-[15px]" aria-hidden="true" />
          <span className="hidden sm:inline">
            {productHome ? "返回产品首页" : "返回产品目录"}
          </span>
        </a>
        <LanguageSwitcher touchFriendly />
      </div>
    </header>
  );
}
