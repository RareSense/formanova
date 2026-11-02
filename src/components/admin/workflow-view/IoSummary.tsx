import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SUMMARY_MODELS, SUMMARY_PICTURES, type IoItem, type IoSummary } from '@/lib/admin-workflow-views/io-summary';
import { ImageThumb } from './ImageThumb';
import { ModelPreview } from './ModelPreview';

/**
 * "Inputs -> Outputs": the run's pictures and 3D files at a glance, right under the run
 * header. Two columns from md up, stacked on phones. Pictures are the usual thumbnails
 * (click to enlarge); 3D files get a lazy viewer (ModelPreview). Prompts, settings, steps
 * and raw JSON stay in the sections below. No data-path here: the completeness contract is
 * about the full sections, not this summary.
 */
function Column({ title, items, fallbackStem }: { title: 'Inputs' | 'Outputs'; items: IoItem[]; fallbackStem: string }) {
  const [pictureLimit, setPictureLimit] = useState(SUMMARY_PICTURES);
  const [modelLimit, setModelLimit] = useState(SUMMARY_MODELS);
  const images = items.filter((i) => i.kind === 'image');
  const models = items.filter((i) => i.kind === 'model3d');
  const id = `admin-io-${title.toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id} className="min-w-0 space-y-3">
      <p id={id} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</p>
      {!items.length && <p className="text-sm text-muted-foreground">No pictures or 3D files.</p>}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2">
          {images.slice(0, pictureLimit).map((i) => <ImageThumb key={i.key} url={i.url} label={i.label} />)}
        </div>
      )}
      {images.length > pictureLimit && (
        <button type="button" className="text-xs underline" onClick={() => setPictureLimit((n) => n + SUMMARY_PICTURES)}>
          {`Show ${Math.min(SUMMARY_PICTURES, images.length - pictureLimit)} more of ${images.length - pictureLimit} pictures`}
        </button>
      )}
      {models.length > 0 && (
        <div className={`grid gap-4 ${models.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {models.slice(0, modelLimit).map((i) => <ModelPreview key={i.key} item={i} fallbackStem={fallbackStem} />)}
        </div>
      )}
      {models.length > modelLimit && (
        <button type="button" className="text-xs underline" onClick={() => setModelLimit((n) => n + SUMMARY_MODELS)}>
          {`Show ${Math.min(SUMMARY_MODELS, models.length - modelLimit)} more of ${models.length - modelLimit} 3D files`}
        </button>
      )}
    </div>
  );
}

export function IoSummarySection({ summary, fallbackStem }: { summary: IoSummary; fallbackStem: string }) {
  return (
    <section aria-labelledby="admin-section-io">
      <Card>
        <CardHeader>
          <CardTitle id="admin-section-io" className="font-display text-2xl tracking-wide">Inputs → Outputs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Column title="Inputs" items={summary.inputs} fallbackStem={fallbackStem} />
            <div className="hidden items-start justify-center pt-8 text-muted-foreground md:flex" aria-hidden>
              <ArrowRight className="h-5 w-5" />
            </div>
            <Column title="Outputs" items={summary.outputs} fallbackStem={fallbackStem} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
