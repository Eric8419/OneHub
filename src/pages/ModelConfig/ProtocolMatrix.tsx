import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Card, SectionTitle, Tag } from '../../components/ui';

const protocols = ['OpenAI Chat', 'Anthropic Messages', 'OpenAI Responses'];

const capabilities = [
  { name: '文本与流式输出', status: '完整', detail: '支持任意入口与上游组合' },
  { name: '工具调用', status: '严格', detail: '保留调用 ID、函数名、参数增量与结果' },
  { name: '结构化输出', status: '严格', detail: '无法无损表示时返回明确的 422 错误' },
  { name: '图像与文件输入', status: '转换', detail: 'URL、Base64 与文件 ID 按目标协议编码' },
  { name: '推理参数', status: '转换', detail: 'effort 可转换；精确预算不可表示时拒绝' },
];

export const ProtocolMatrix: React.FC = () => (
  <section className="mc-protocol-matrix">
    <SectionTitle>协议转换能力</SectionTitle>
    <Card>
      <div className="mc-protocol-matrix__routes" aria-label="协议互转矩阵">
        {protocols.map((source) =>
          protocols.map((target) => (
            <div className="mc-protocol-route" key={`${source}-${target}`}>
              <span>{source}</span>
              <ArrowRight size={13} aria-hidden />
              <span>{target}</span>
              <CheckCircle2 size={14} className="mc-protocol-route__ok" aria-label="支持" />
            </div>
          )),
        )}
      </div>

      <div className="mc-protocol-matrix__capabilities">
        {capabilities.map((capability) => (
          <div className="mc-protocol-capability" key={capability.name}>
            <div>
              <strong>{capability.name}</strong>
              <p>{capability.detail}</p>
            </div>
            <Tag variant={capability.status === '严格' ? 'blue' : 'brand'}>
              {capability.status === '严格' && <ShieldAlert size={12} aria-hidden />}
              {capability.status}
            </Tag>
          </div>
        ))}
      </div>
    </Card>
  </section>
);
