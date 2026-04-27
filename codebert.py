from transformers import RobertaTokenizer, RobertaModel
import torch, sys, json

tokenizer = RobertaTokenizer.from_pretrained("microsoft/codebert-base")
model = RobertaModel.from_pretrained("microsoft/codebert-base")

def embed(text):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=512
    )
    with torch.no_grad():
        outputs = model(**inputs)
    return outputs.last_hidden_state.mean(dim=1).squeeze().tolist()

texts = json.loads(sys.stdin.read())
embeddings = [embed(t) for t in texts]

print(json.dumps(embeddings))